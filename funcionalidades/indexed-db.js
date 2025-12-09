/**
 * ARQUIVO: indexed-db.js
 * 
 * O LocalStorage só aguenta textos pequenos (aprox 5MB).
 * Para vídeos e imagens ("Mídia"), precisamos do INDEXED DB.
 * 
 * Este arquivo garante a funcionalidade "Sem Perda de Dados" para arquivos.
 */

const DB_NAME = 'VideoOrganizerDB';
const STORE_NAME = 'media_store';

// Abre (ou cria) o banco de dados
const openDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
};

export const mediaDB = {
    /**
     * Salva um arquivo (Blob) no banco de dados.
     * @param {string} id - ID único do card/vídeo
     * @param {Blob} file - O arquivo em si
     */
    async saveMedia(id, file) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({ id: id, file: file, timestamp: Date.now() });

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject('Erro ao salvar mídia');
        });
    },

    /**
     * Recupera um arquivo salvo.
     */
    async getMedia(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);

            request.onsuccess = (event) => {
                const result = event.target.result;
                resolve(result ? result.file : null);
            };
            request.onerror = () => reject('Erro ao recuperar mídia');
        });
    },

    /**
     * Apaga uma mídia quando o usuário deleta o card.
     */
    async deleteMedia(id) {
        const db = await openDB();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        transaction.objectStore(STORE_NAME).delete(id);
    }
};