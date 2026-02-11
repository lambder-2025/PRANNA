import { DB } from './db.js';
import { Utils } from './utils.js';

const app = {
    state: {
        isAdmin: false,
        subUser: null,
        users: [],
        fileHandle: null // For Direct Save
    },

    async init() {
        await DB.init();
        this.checkAuth();
        this.bindEvents();
        this.updateSyncStatus();
    },

    showView(viewId) {
        document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
        const el = document.getElementById(viewId);
        if (el) {
            el.classList.remove('hidden');
            el.classList.add('active');
        }
    },

    checkAuth() {
        if (sessionStorage.getItem('isAdmin') === 'true') {
            this.state.isAdmin = true;
            this.showView('admin-view');
        } else {
            this.showView('admin-auth-view');
        }
    },

    bindEvents() {
        // Auth
        document.getElementById('admin-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const pass = document.getElementById('admin-pass').value;

            try {
                const res = await fetch('./data/admin.json');
                if (!res.ok) throw new Error('No admin config');
                const adminData = await res.json();

                const inputHash = await Utils.hashPassword(pass);

                if (inputHash === adminData.passwordHash) {
                    this.state.isAdmin = true;
                    sessionStorage.setItem('isAdmin', 'true');
                    this.showView('admin-view');
                } else {
                    alert('Contraseña incorrecta');
                }
            } catch (err) {
                console.error(err);
                alert('Error de autenticación: verifica data/admin.json');
            }
        });

        document.getElementById('logout-btn').addEventListener('click', () => {
            sessionStorage.removeItem('isAdmin');
            location.reload();
        });

        // Navigation
        document.getElementById('manage-users-btn').addEventListener('click', () => {
            document.getElementById('scanner-container').classList.add('hidden');
            document.getElementById('admin-user-details').classList.add('hidden');
            this.loadUserList();
            document.getElementById('user-management-view').classList.remove('hidden');
        });

        document.getElementById('close-manage-btn').addEventListener('click', () => {
            document.getElementById('user-management-view').classList.add('hidden');
        });

        // Search
        document.getElementById('user-search').addEventListener('input', (e) => {
            this.renderUserList(e.target.value);
        });

        // CRUD - Open Form
        document.getElementById('add-user-btn').addEventListener('click', () => {
            this.openEditForm(); // No user = create mode
        });

        document.getElementById('cancel-edit-btn').addEventListener('click', () => {
            document.getElementById('edit-user-form').classList.add('hidden');
        });

        // CRUD - Save
        document.getElementById('user-crud-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveUser();
        });

        // Scanner
        document.getElementById('scan-btn').addEventListener('click', () => this.startScanner());
        document.getElementById('stop-scan').addEventListener('click', () => this.stopScanner());

        // User Details (Scan Result)
        document.getElementById('close-user-details').addEventListener('click', () => {
            document.getElementById('admin-user-details').classList.add('hidden');
            document.getElementById('scan-btn').classList.remove('hidden');
            this.state.subUser = null;
        });

        // Add Visit (Scan Result)
        document.querySelectorAll('.action-add').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (!this.state.subUser) return;
                try {
                    const updatedUser = await DB.addVisit(this.state.subUser.id);
                    this.state.subUser = updatedUser; // Update local ref
                    this.renderAdminUserDetails(updatedUser);

                    if (this.state.fileHandle) {
                        await this.saveToHandle();
                        alert('✅ Visita guardada en usuarios.json');
                    } else {
                        alert('⚠️ Visita guardada en memoria. \n\n¡Recuerda conectar el archivo o descargar el JSON para no perder cambios!');
                        this.updateSyncStatus();
                    }
                } catch (err) {
                    alert(err.message);
                }
            });
        });

        // Download
        document.getElementById('download-db-btn').addEventListener('click', async () => {
            const blob = await DB.exportUsersJSON();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'usuarios-actualizados.json';
            a.click();
        });

        // Direct File Connect
        document.getElementById('connect-file-btn').addEventListener('click', async () => {
            try {
                // Request handle
                const [handle] = await window.showOpenFilePicker({
                    types: [{
                        description: 'JSON Database',
                        accept: { 'application/json': ['.json'] }
                    }],
                    multiple: false
                });

                this.state.fileHandle = handle;

                // Verify content matches (optional but good safety)
                // const file = await handle.getFile();
                // const text = await file.text();

                document.getElementById('connect-file-btn').classList.add('hidden');
                document.getElementById('file-status').textContent = "✅ Modo: Edición Directa Activada";
                document.getElementById('file-status').style.color = "var(--primary-color)";
                document.getElementById('download-db-btn').classList.add('hidden'); // Hide manual download

                // Auto-sync current pending if any
                const pending = await DB.getPendingActions();
                if (pending && pending.length > 0) {
                    await this.saveToHandle();
                    alert('✅ Se han sincronizado los cambios pendientes en el archivo.');
                } else {
                    alert('✅ Conexión exitosa. Los próximos cambios se guardarán directo en usuarios.json');
                }

            } catch (err) {
                console.error(err);
                if (err.name !== 'AbortError') {
                    alert('Tu navegador no soporta edición directa o fue cancelado.');
                }
            }
        });
    },

    // --- Direct Save Logic ---
    async saveToHandle() {
        if (!this.state.fileHandle) return false;

        try {
            const users = await DB.getAll('users');
            // Pretty print JSON
            const content = JSON.stringify(users, null, 2);

            const writable = await this.state.fileHandle.createWritable();
            await writable.write(content);
            await writable.close();

            // Clear pending since we just saved "to server" (local file)
            // In a real app we'd clear pending queue here.

            return true;
        } catch (e) {
            console.error('Save failed', e);
            alert('Error guardando archivo directo: ' + e.message);
            return false;
        }
    },

    // --- User Management (CRUD) ---
    async loadUserList() {
        try {
            this.state.users = await DB.getAll('users');
            this.renderUserList();
        } catch (e) {
            console.error(e);
            alert('Error cargando usuarios');
        }
    },

    renderUserList(filter = '') {
        const list = document.getElementById('user-list');
        list.innerHTML = '';
        const term = filter.toLowerCase();

        this.state.users
            .filter(u => u.nombre.toLowerCase().includes(term) || u.id.includes(term))
            .forEach(u => {
                const li = document.createElement('li');
                li.style.cssText = "padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;";
                li.innerHTML = `
                    <span><strong>${u.nombre}</strong> (${u.visitas} pts)</span>
                    <button class="btn text small" data-id="${u.id}">Editar</button>
                `;
                li.querySelector('button').onclick = () => this.openEditForm(u);
                list.appendChild(li);
            });
    },

    openEditForm(user = null) {
        const formTitle = document.getElementById('edit-form-title');
        const idInput = document.getElementById('edit-user-id');
        const nameInput = document.getElementById('edit-user-name');
        const telInput = document.getElementById('edit-user-tel');
        const passInput = document.getElementById('edit-user-pass');
        const visitsInput = document.getElementById('edit-user-visits');

        passInput.value = ''; // Always clear pass field

        if (user) {
            formTitle.textContent = 'Editar Usuario';
            idInput.value = user.id;
            nameInput.value = user.nombre;
            telInput.value = user.telefono;
            visitsInput.value = user.visitas;
            passInput.placeholder = "Dejar en blanco para mantener actual";
        } else {
            formTitle.textContent = 'Nuevo Usuario';
            idInput.value = '';
            nameInput.value = '';
            telInput.value = '';
            visitsInput.value = 0;
            passInput.placeholder = "Contraseña (Opcional, default: 1234)";
        }

        document.getElementById('edit-user-form').classList.remove('hidden');
    },

    async saveUser() {
        const id = document.getElementById('edit-user-id').value;
        const nombre = document.getElementById('edit-user-name').value;
        const telefono = document.getElementById('edit-user-tel').value;
        const pass = document.getElementById('edit-user-pass').value;
        const visits = parseInt(document.getElementById('edit-user-visits').value);

        const defaultHash = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4"; // 1234

        let user;
        if (id) {
            // Update
            user = await DB.getUser(id);
            user.nombre = nombre;
            user.telefono = telefono;
            user.visitas = visits;
            if (pass) {
                user.passwordHash = await Utils.hashPassword(pass);
            }
            user.updatedAt = new Date().toISOString();
        } else {
            // Create
            let passwordHash = defaultHash;
            if (pass) {
                passwordHash = await Utils.hashPassword(pass);
            }

            user = {
                id: `u-${Date.now()}`,
                nombre,
                telefono,
                visitas,
                passwordHash,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        }

        await DB.put('users', user);
        await DB.logPendingAction({ type: id ? 'updateUser' : 'createUser', userId: user.id, timestamp: new Date().toISOString() });

        // Try auto-save if handle exists
        if (this.state.fileHandle) {
            await this.saveToHandle();
        } else {
            this.updateSyncStatus();
        }

        document.getElementById('edit-user-form').classList.add('hidden');
        this.loadUserList(); // Refresh list
        alert('Usuario guardado');
    },

    // --- Scanner Logic ---
    html5QrcodeScanner: null,

    startScanner() {
        document.getElementById('scan-btn').classList.add('hidden');
        document.getElementById('scanner-container').classList.remove('hidden');
        document.getElementById('admin-user-details').classList.add('hidden');
        document.getElementById('user-management-view').classList.add('hidden');

        this.html5QrcodeScanner = new Html5Qrcode("reader");
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };

        this.html5QrcodeScanner.start(
            { facingMode: "environment" },
            config,
            (decodedText) => this.onScanSuccess(decodedText),
            (errorMessage) => { /* ignore */ }
        ).catch(err => {
            console.error(err);
            alert('Error iniciando cámara. Verifica permisos.');
            this.stopScanner();
        });
    },

    stopScanner() {
        if (this.html5QrcodeScanner) {
            this.html5QrcodeScanner.stop().then(() => {
                document.getElementById('scanner-container').classList.add('hidden');
                document.getElementById('scan-btn').classList.remove('hidden');
                this.html5QrcodeScanner.clear();
            });
        }
    },

    onScanSuccess(decodedText) {
        if (decodedText.startsWith('uid:')) {
            const userId = decodedText.split(':')[1];
            this.stopScanner();
            this.loadUser(userId);
        } else {
            alert('QR no válido para este sistema');
        }
    },

    async loadUser(userId) {
        const user = await DB.getUser(userId);
        if (!user) {
            alert('Usuario no encontrado en la base de datos');
            return;
        }
        this.state.subUser = user;
        document.getElementById('scan-btn').classList.add('hidden'); // Ensure hidden
        document.getElementById('admin-user-details').classList.remove('hidden');
        this.renderAdminUserDetails(user);
    },

    async renderAdminUserDetails(user) {
        document.getElementById('admin-user-name').textContent = user.nombre;
        document.getElementById('admin-user-visits').textContent = user.visitas;

        const promos = await DB.getPromos();
        const container = document.getElementById('admin-promo-list');
        container.innerHTML = '';

        promos.forEach(p => {
            const canRedeem = user.visitas >= p.visitasRequeridas;
            const btn = document.createElement('button');
            btn.className = `btn ${canRedeem ? 'primary' : 'secondary'}`;
            btn.style.marginTop = '0.5rem';
            btn.textContent = `Canjear ${p.titulo} (${p.visitasRequeridas} pts)`;
            btn.disabled = !canRedeem;

            btn.onclick = async () => {
                if (confirm(`¿Confirmar canje de "${p.titulo}" para ${user.nombre}?`)) {
                    try {
                        const updatedUser = await DB.redeemPromo(user.id, p.id);
                        this.state.subUser = updatedUser;
                        this.renderAdminUserDetails(updatedUser);

                        if (this.state.fileHandle) {
                            await this.saveToHandle();
                            alert('¡Canje exitoso y guardado!');
                        } else {
                            alert('¡Canje exitoso! (Recuerda sincronizar)');
                            this.updateSyncStatus();
                        }
                    } catch (e) {
                        alert(e.message);
                    }
                }
            };
            container.appendChild(btn);
        });
    },

    async updateSyncStatus() {
        const pending = await DB.getPendingActions();
        const count = pending.length;
        document.getElementById('pending-count').textContent = count;

        if (count > 0) {
            document.getElementById('download-db-btn').classList.remove('outline');
            document.getElementById('download-db-btn').classList.add('primary');
            document.getElementById('download-db-btn').innerText = `💾 Descargar usuarios.json (${count} cambios)`;
        }
    }
};

window.addEventListener('DOMContentLoaded', () => app.init());
