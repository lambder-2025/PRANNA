import { DB } from './db.js';

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
        if (storedId) {
            this.loadUser(storedId);
        } else {
            this.showView('login-view');
        }
    },

    bindEvents() {
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('user-id-input').value.trim();
            if (id) {
                this.loadUser(id);
            }
        });

        document.getElementById('logout-btn').addEventListener('click', () => {
            localStorage.removeItem('userId');
            location.reload();
        });
    },

    async loadUser(userId) {
        // Try precise match first, then phone match if implemented in DB (simplified here to ID)
        // In a real app we might want to search by phone if ID fails, or use an index.
        try {
            // Check if it's a direct ID first
            let user = await DB.getUser(userId);

            // If not found, try finding by phone (iterating - acceptable for small JSON)
            if (!user) {
                const users = await DB.getAll('users');
                user = users.find(u => u.telefono === userId || u.id === userId);
            }

            if (user) {
                localStorage.setItem('userId', user.id);
                this.renderClientView(user);
                this.showView('client-view');
            } else {
                alert('Usuario no encontrado. Verifique su ID o Teléfono.');
            }
        } catch (e) {
            console.error(e);
            alert('Error al cargar datos.');
        }
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
