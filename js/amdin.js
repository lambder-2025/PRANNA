import { DB } from './db.js';

const ADMIN_PASS = '1234'; // Simple hardcoded pass

const app = {
    state: {
        isAdmin: false,
        subUser: null
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
        document.getElementById('admin-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const pass = document.getElementById('admin-pass').value;
            if (pass === ADMIN_PASS) {
                this.state.isAdmin = true;
                sessionStorage.setItem('isAdmin', 'true');
                this.showView('admin-view');
            } else {
                alert('Contraseña incorrecta');
            }
        });

        document.getElementById('logout-btn').addEventListener('click', () => {
            sessionStorage.removeItem('isAdmin');
            location.reload();
        });

        // Scanner
        document.getElementById('scan-btn').addEventListener('click', () => this.startScanner());
        document.getElementById('stop-scan').addEventListener('click', () => this.stopScanner());

        // User Details
        document.getElementById('close-user-details').addEventListener('click', () => {
            document.getElementById('admin-user-details').classList.add('hidden');
            document.getElementById('scan-btn').classList.remove('hidden');
            this.state.subUser = null;
        });

        // Add Visit
        document.querySelectorAll('.action-add').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (!this.state.subUser) return;
                try {
                    const updatedUser = await DB.addVisit(this.state.subUser.id);
                    this.state.subUser = updatedUser;
                    this.renderAdminUserDetails(updatedUser);
                    alert('Visita agregada correctamente');
                    this.updateSyncStatus();
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
    },

    // --- Scanner Logic ---
    html5QrcodeScanner: null,

    startScanner() {
        document.getElementById('scan-btn').classList.add('hidden');
        document.getElementById('scanner-container').classList.remove('hidden');
        document.getElementById('admin-user-details').classList.add('hidden');

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
                        alert('¡Canje exitoso!');
                        this.updateSyncStatus();
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
