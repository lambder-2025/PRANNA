import { DB } from './db.js';
import { Utils } from './utils.js';

const app = {
    async init() {
        await DB.init();
        this.checkSession();
        this.bindEvents();
    },

    showView(viewId) {
        document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
        const el = document.getElementById(viewId);
        if (el) {
            el.classList.remove('hidden');
            el.classList.add('active');
        }
    },

    checkSession() {
        const storedId = localStorage.getItem('userId');
        const sessionValid = sessionStorage.getItem('userSessionValid');
        if (storedId && sessionValid === 'true') {
            this.loadUser(storedId);
        } else {
            this.showView('login-view');
        }
    },

    bindEvents() {
        // Advanced Easter Egg: 
        // 1. Enter '404' in User ID Input
        // 2. Click Header Title 10 times
        let clicks = 0;
        const headerTitle = document.querySelector('.app-header h1');

        headerTitle.addEventListener('click', () => {
            const idInput = document.getElementById('user-id-input');

            if (idInput && idInput.value.trim() === '404') {
                clicks++;
                // Visual feedback (optional)
                headerTitle.style.opacity = 1 - (clicks * 0.05);

                if (clicks >= 10) {
                    if (confirm('¿Acceder al Panel de Administración?')) {
                        window.location.href = 'admin.html';
                    }
                    clicks = 0;
                    headerTitle.style.opacity = 1;
                }
            } else {
                // Reset if input is not 404
                clicks = 0;
                headerTitle.style.opacity = 1;
            }

            // Reset after 3 seconds of inactivity
            if (this.clickTimeout) clearTimeout(this.clickTimeout);
            this.clickTimeout = setTimeout(() => {
                clicks = 0;
                headerTitle.style.opacity = 1;
            }, 3000);
        });

        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('user-id-input').value.trim();
            const pass = document.getElementById('user-pass-input').value.trim();

            if (id && pass) {
                await this.attemptLogin(id, pass);
            } else {
                alert('Por favor ingresa ID y Contraseña');
            }
        });

        document.getElementById('logout-btn').addEventListener('click', () => {
            localStorage.removeItem('userId');
            sessionStorage.removeItem('userSessionValid');
            location.reload();
        });
    },

    async attemptLogin(id, password) {
        try {
            // Find user by ID or Phone
            const users = await DB.getAll('users');
            const user = users.find(u => u.id === id || u.telefono === id);

            if (!user) {
                alert('Usuario no encontrado');
                return;
            }

            // Verify Password
            const inputHash = await Utils.hashPassword(password);
            if (user.passwordHash && user.passwordHash === inputHash) {
                localStorage.setItem('userId', user.id);
                sessionStorage.setItem('userSessionValid', 'true');
                this.renderClientView(user);
                this.showView('client-view');
            } else {
                alert('Contraseña incorrecta');
            }
        } catch (e) {
            console.error(e);
            alert('Error en login');
        }
    },

    async loadUser(userId) {
        // Direct load if session is already valid
        try {
            const user = await DB.getUser(userId);
            if (user) {
                this.renderClientView(user);
                this.showView('client-view');
            }
        } catch (e) { console.error(e); }
    },

    async renderClientView(user) {
        document.getElementById('user-name').textContent = user.nombre;
        document.getElementById('user-id-display').textContent = `ID: ${user.id}`;
        document.getElementById('visit-count').textContent = user.visitas;

        // Generate QR
        const qrContent = `uid:${user.id}`;
        const qrContainer = document.getElementById('user-qr');
        qrContainer.innerHTML = '';
        const canvas = document.createElement('canvas');
        try {
            await QRCode.toCanvas(canvas, qrContent, { width: 180, margin: 1 });
            qrContainer.appendChild(canvas);
        } catch (e) {
            console.error(e);
            qrContainer.innerText = 'Error QR';
        }

        // Promos
        const promos = await DB.getPromos();
        const list = document.getElementById('promo-list');
        list.innerHTML = '';

        promos.forEach(p => {
            const li = document.createElement('li');
            li.className = `promo-item ${user.visitas >= p.visitasRequeridas ? 'achieved' : ''}`;
            const btnHtml = user.visitas >= p.visitasRequeridas
                ? '<span style="color:var(--primary-color); font-weight:bold;">¡Listo para canjear!</span>'
                : `<small>Faltan ${p.visitasRequeridas - user.visitas}</small>`;

            li.innerHTML = `
                <div>
                    <strong>${p.titulo}</strong>
                    <br><small>${p.descripcion}</small>
                </div>
                <div>
                    ${btnHtml}
                </div>
            `;
            list.appendChild(li);
        });
    }
};

window.addEventListener('DOMContentLoaded', () => app.init());
