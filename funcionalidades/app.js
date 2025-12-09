/**
 * ARQUIVO: app.js
 * 
 * Este é o maestro da aplicação. Ele importa as funcionalidades de outras pastas
 * e controla o fluxo da tela.
 */

import { auth, firestore } from './firebase-service.js';
import { mediaDB } from './indexed-db.js';

// --- ESTADO DA APLICAÇÃO ---
let currentUser = null;
let appData = []; // Lista de projetos carregados na memória
let isGuest = false;

// --- ELEMENTOS DO DOM (INTERFACE) ---
const loginScreen = document.getElementById('login-screen');
const appContent = document.getElementById('app-content');
const btnLoginGoogle = document.getElementById('btn-login-google');
const btnGuest = document.getElementById('btn-guest');
const btnLogout = document.getElementById('btn-logout');
const contentGrid = document.getElementById('content-grid');
const btnAddNew = document.getElementById('btn-add-new');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

// --- 1. GERENCIAMENTO DE SESSÃO (LOGIN) ---

/**
 * Monitora o estado de autenticação.
 * Esta é a "FONTE ÚNICA DE VERDADE" para decidir qual tela mostrar.
 */
auth.onAuthStateChanged((user) => {
    if (user) {
        // Usuário logado com Google
        setupSession(user, false);
    } else {
        // Usuário deslogado do Google, verificar se é Visitante
        const guestSession = localStorage.getItem('guest_session');
        if (guestSession === 'active') {
            setupSession({ displayName: 'Visitante (Offline)', uid: 'guest' }, true);
        } else {
            showLoginScreen();
        }
    }
});

// Botão Entrar com Google
btnLoginGoogle.addEventListener('click', async () => {
    toggleLoading(true, 'Conectando ao Google...');
    try {
        await auth.signInWithGoogle();
        // O onAuthStateChanged vai lidar com a mudança de tela automaticamente
    } catch (error) {
        showToast('Erro no login: ' + error.message, 'error');
    } finally {
        toggleLoading(false);
    }
});

// Botão Visitante
btnGuest.addEventListener('click', () => {
    toggleLoading(true, 'Iniciando modo offline...');
    // Pequeno delay artificial para sensação de carregamento
    setTimeout(() => {
        localStorage.setItem('guest_session', 'active');
        setupSession({ displayName: 'Visitante (Offline)', uid: 'guest' }, true);
        toggleLoading(false);
    }, 500);
});

// Botão Sair
btnLogout.addEventListener('click', async () => {
    if (!confirm('Deseja realmente sair?')) return;

    toggleLoading(true, 'Saindo...');
    try {
        if (isGuest) {
            localStorage.removeItem('guest_session');
            showLoginScreen();
        } else {
            await auth.signOut();
        }
    } catch (e) {
        showToast('Erro ao sair', 'error');
    } finally {
        toggleLoading(false);
    }
});

// Configura a sessão e carrega dados
function setupSession(user, guestMode) {
    currentUser = user;
    isGuest = guestMode;
    
    // Atualiza nome no cabeçalho
    document.getElementById('user-display-name').textContent = user.displayName;
    
    // Troca as telas
    loginScreen.classList.add('hidden');
    appContent.classList.remove('hidden');

    loadContent(); // Inicia o carregamento dos dados
}

function showLoginScreen() {
    currentUser = null;
    isGuest = false;
    appData = [];
    loginScreen.classList.remove('hidden');
    appContent.classList.add('hidden');
}

// --- 2. GERENCIAMENTO DE DADOS (PERSISTÊNCIA) ---

async function loadContent() {
    contentGrid.innerHTML = '<p style="color:gray; grid-column:1/-1; text-align:center;">Carregando seus projetos...</p>';
    
    try {
        if (isGuest) {
            const localData = localStorage.getItem('guest_content');
            appData = localData ? JSON.parse(localData) : [];
        } else {
            appData = await firestore.loadUserContent(currentUser.uid);
        }

        // Ordenação: Mais novos primeiro (baseado no timestamp)
        appData.sort((a, b) => b.timestamp - a.timestamp);

        renderCards();
    } catch (e) {
        showToast('Erro ao carregar dados', 'error');
        contentGrid.innerHTML = '<p style="color:red">Falha ao carregar.</p>';
    }
}

async function saveContent() {
    try {
        if (isGuest) {
            localStorage.setItem('guest_content', JSON.stringify(appData));
        } else {
            await firestore.saveUserContent(currentUser.uid, appData);
        }
        return true;
    } catch (e) {
        console.error(e);
        showToast('Erro ao salvar dados. Armazenamento cheio?', 'error');
        return false;
    }
}

// --- 3. UI E RENDERIZAÇÃO ---

function renderCards() {
    contentGrid.innerHTML = '';
    
    if (appData.length === 0) {
        contentGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; color:#555; margin-top:40px;">
                <p>Nenhum projeto encontrado.</p>
                <p>Clique no botão <strong>+</strong> para começar.</p>
            </div>`;
        return;
    }

    appData.forEach(item => {
        const card = createCardElement(item);
        contentGrid.appendChild(card);
        // Carrega a mídia de forma assíncrona para não travar a UI
        loadMediaForCard(item.id, item.type);
    });
}

function createCardElement(item) {
    const card = document.createElement('div');
    card.className = 'card';
    
    // Data formatada
    const date = new Date(item.timestamp || Date.now()).toLocaleDateString('pt-BR');

    // Usamos textContent para evitar XSS (Injeção de Script)
    const titleDiv = document.createElement('div');
    titleDiv.className = 'card-title';
    titleDiv.textContent = item.title;

    const descDiv = document.createElement('div');
    descDiv.className = 'card-desc';
    descDiv.textContent = item.desc || 'Sem descrição';

    card.innerHTML = `
        <div class="card-media" id="media-${item.id}">
            <span class="spinner" style="width:20px; height:20px; border-width:2px;"></span>
        </div>
        <div class="card-body">
            <!-- Título e Descrição inseridos via appendChild abaixo -->
        </div>
        <div class="card-footer">
            <span class="card-date">${date}</span>
            <button class="btn btn-sm btn-outline btn-delete" data-id="${item.id}" aria-label="Excluir projeto">
                Excluir
            </button>
        </div>
    `;

    // Inserção segura
    card.querySelector('.card-body').prepend(descDiv);
    card.querySelector('.card-body').prepend(titleDiv);

    // Evento de deletar
    card.querySelector('.btn-delete').addEventListener('click', () => deleteItem(item.id));

    return card;
}

async function loadMediaForCard(id, type) {
    const container = document.getElementById(`media-${id}`);
    if (!container) return;

    try {
        const fileBlob = await mediaDB.getMedia(id);
        
        if (fileBlob) {
            const url = URL.createObjectURL(fileBlob);
            container.innerHTML = ''; // Limpa o loader
            
            if (type.startsWith('video')) {
                const video = document.createElement('video');
                video.src = url;
                video.controls = true;
                container.appendChild(video);
            } else if (type.startsWith('image')) {
                const img = document.createElement('img');
                img.src = url;
                img.alt = 'Mídia do projeto';
                container.appendChild(img);
            } else {
                container.textContent = 'Arquivo desconhecido';
            }
        } else {
            container.innerHTML = '<span style="color:#555; font-size:0.8rem">Sem mídia</span>';
        }
    } catch (e) {
        container.innerHTML = '<span style="color:red; font-size:0.8rem">Erro ao carregar</span>';
    }
}

// --- 4. ADICIONAR / EDITAR (MODAL) ---

const modal = document.getElementById('modal-editor');
const btnCancel = document.getElementById('btn-cancel-edit');
const btnSave = document.getElementById('btn-save-edit');
const inputTitle = document.getElementById('input-title');
const inputDesc = document.getElementById('input-desc');
const inputFile = document.getElementById('input-file');

btnAddNew.addEventListener('click', () => {
    // Reset do formulário
    inputTitle.value = '';
    inputDesc.value = '';
    inputFile.value = '';
    document.getElementById('preview-area').textContent = '';
    
    modal.classList.remove('hidden');
    inputTitle.focus();
});

btnCancel.addEventListener('click', () => modal.classList.add('hidden'));

// Fechar modal ao clicar fora
modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
});

btnSave.addEventListener('click', async () => {
    const title = inputTitle.value.trim();
    const desc = inputDesc.value.trim();
    const file = inputFile.files[0];

    if (!title) return showToast('O título é obrigatório', 'error');

    // Validação de Tamanho (Máx 50MB)
    if (file && file.size > 50 * 1024 * 1024) {
        return showToast('O arquivo é muito grande (Máx 50MB)', 'error');
    }

    toggleLoading(true, 'Salvando projeto...');
    
    try {
        const newId = Date.now().toString();
        
        // 1. Salvar Mídia no IndexedDB (se houver)
        if (file) {
            await mediaDB.saveMedia(newId, file);
        }

        // 2. Criar objeto de dados
        const newItem = {
            id: newId,
            title,
            desc,
            type: file ? file.type : 'none',
            timestamp: Date.now() // Importante para ordenação
        };

        // 3. Atualizar lista e salvar persistência
        appData.push(newItem);
        const saved = await saveContent();

        if (saved) {
            renderCards();
            modal.classList.add('hidden');
            showToast('Projeto salvo com sucesso!');
        }
    } catch (error) {
        showToast('Erro ao salvar: ' + error.message, 'error');
    } finally {
        toggleLoading(false);
    }
});

async function deleteItem(id) {
    if(!confirm('Tem certeza que deseja excluir este projeto? Esta ação é irreversível.')) return;
    
    toggleLoading(true, 'Excluindo...');
    try {
        // Remove da lista em memória
        appData = appData.filter(i => i.id !== id);
        
        // Atualiza persistência
        await saveContent();
        
        // Remove mídia do IndexedDB para liberar espaço
        await mediaDB.deleteMedia(id);
        
        renderCards();
        showToast('Projeto removido.');
    } catch (e) {
        showToast('Erro ao excluir', 'error');
    } finally {
        toggleLoading(false);
    }
}

// --- UTILITÁRIOS ---

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    
    if (type === 'error') toast.style.backgroundColor = '#d32f2f'; // Vermelho
    if (type === 'info') toast.style.backgroundColor = '#0288d1'; // Azul
    
    container.appendChild(toast);
    
    // Remove automaticamente após 3 segundos
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 3000);
}

function toggleLoading(show, text = 'Carregando...') {
    if (show) {
        loadingText.textContent = text;
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}