/**
 * ARQUIVO: firebase-service.js
 * 
 * Este arquivo normalmente conteria as chaves de API reais do Firebase.
 * Como este é um ambiente de demonstração/aprendizado, criei uma "Classe Simulada" (Mock).
 * 
 * ELA FUNCIONA EXATAMENTE como o Firebase funcionaria:
 * 1. Simula login com Popup.
 * 2. Simula persistência de usuário (mesmo recarregando a página).
 * 3. Simula salvamento em banco de dados "Nuvem" (usando LocalStorage).
 */

class MockFirebaseAuth {
    constructor() {
        // AUDITORIA - PERSISTÊNCIA:
        // No Firebase real, a persistência é configurada via:
        // await auth.setPersistence(browserLocalPersistence);
        // Aqui, simulamos isso recuperando o usuário do localStorage ao iniciar a classe.
        const savedUser = localStorage.getItem('mock_auth_user');
        this.currentUser = savedUser ? JSON.parse(savedUser) : null;
        this.authListener = null;
    }

    /**
     * Simula auth.signInWithGoogle()
     * Garante que o fluxo use Popup e Persistência Local.
     */
    async signInWithGoogle() {
        return new Promise((resolve) => {
            // Simula um atraso de rede
            setTimeout(() => {
                const fakeUser = {
                    uid: 'user_' + Math.random().toString(36).substr(2, 9),
                    displayName: 'Estudante Web',
                    email: 'estudante@exemplo.com',
                    photoURL: 'https://via.placeholder.com/150'
                };
                
                this.currentUser = fakeUser;
                
                // AUDITORIA:
                // Salva no localStorage para garantir que o usuário continue logado
                // se fechar a aba (Simula browserLocalPersistence).
                localStorage.setItem('mock_auth_user', JSON.stringify(fakeUser));
                
                // Notifica o app que o status mudou
                if (this.authListener) this.authListener(fakeUser);
                
                resolve({ user: fakeUser });
            }, 800);
        });
    }

    /**
     * Simula auth.signOut()
     */
    async signOut() {
        return new Promise((resolve) => {
            setTimeout(() => {
                this.currentUser = null;
                // Limpa a persistência local ao sair explicitamente
                localStorage.removeItem('mock_auth_user');
                if (this.authListener) this.authListener(null);
                resolve();
            }, 500);
        });
    }

    /**
     * Simula auth.onAuthStateChanged(callback)
     * Esta é a "Única Fonte de Verdade" para o estado da sessão.
     */
    onAuthStateChanged(callback) {
        this.authListener = callback;
        // Chama imediatamente com o estado atual (seja null ou usuário persistido)
        callback(this.currentUser);
    }
}

class MockFirestore {
    /**
     * Salva dados do usuário na "Nuvem" simulada
     */
    async saveUserContent(userId, contentArray) {
        // No mundo real, isso enviaria para o Firestore do Google.
        // Aqui, salvamos numa chave separada para simular o banco de dados remoto.
        const key = `firestore_data_${userId}`;
        localStorage.setItem(key, JSON.stringify(contentArray));
        console.log(`[Firestore Mock] Dados salvos na nuvem para ${userId}`);
    }

    /**
     * Carrega dados da "Nuvem"
     */
    async loadUserContent(userId) {
        const key = `firestore_data_${userId}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    }
}

// Exporta as instâncias para serem usadas no app.js
export const auth = new MockFirebaseAuth();
export const firestore = new MockFirestore();