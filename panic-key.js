/**
 * panic-key.js
 * This script provides a user-configurable panic key functionality for a website using IndexedDB.
 * When activated, it redirects the user to a pre-configured destination.
 * The user can configure up to 3 separate panic keys.
 * The destination can be an external URL (e.g., https://google.com) or an internal page path (e.g., /dashboard/games.html).
 * The key press must be a single key without any modifiers (Shift, Ctrl, Alt, etc.).
 *
 * This version uses IndexedDB for local storage, ensuring privacy and instantaneous redirection.
 */

// This message helps confirm that the script file itself is being loaded by the browser.
console.log("Debug: panic-key.js script has started.");

// --- IndexedDB Configuration ---
const DB_NAME = 'userLocalSettingsDB';
const STORE_NAME = 'panicKeyStore';

/**
 * Opens the IndexedDB and creates the object store if needed.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database object.
 */
function openDB() {
    return new Promise((resolve, reject) => {
        // This will open the latest version of the database.
        const request = indexedDB.open(DB_NAME);

        // This event handles the creation and updating of the database schema.
        request.onupgradeneeded = event => {
            const db = event.target.result;
            // Create the 'panicKeyStore' object store if it doesn't already exist.
            // We use 'id' as the keyPath (e.g., 'panicKey1', 'panicKey2').
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                console.log("Debug: IndexedDB object store 'panicKeyStore' created.");
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Fetches all panic key settings from the IndexedDB.
 * @param {IDBDatabase} db - The database instance.
 * @returns {Promise<Array<object>>} A promise that resolves with an array of settings objects.
 */
function getSettings(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        // Request all objects from the store. This will return an array of all panic key configs.
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Attaches the 'keydown' event listener to the document with the user's specific settings.
 * @param {Array<object>} settingsArray - An array of panic key settings objects { id, key, type, value }.
 */
function addPanicKeyListener(settingsArray) {
    if (!settingsArray || settingsArray.length === 0) {
        console.log("Debug: No panic key settings found to attach listener.");
        return;
    }

    console.log("Debug: Attaching keydown listener to the document with these settings:", settingsArray);

    document.addEventListener('keydown', (event) => {
        const activeElement = document.activeElement;

        // --- MODIFICATION START ---
        // This check prevents the panic key from firing while a user is typing in any form field or the AI chat box.
        if (activeElement) {
            // Check if the active element is an input field, a textarea, a select element, or contenteditable.
            const tagName = activeElement.tagName.toLowerCase();
            if (['input', 'select', 'textarea'].includes(tagName) || activeElement.isContentEditable) {
                return;
            }
        }
        // --- MODIFICATION END ---

        const noModifiersPressed = !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;

        if (noModifiersPressed) {
            // Find if the pressed key matches any of the configured panic keys.
            const matchedSetting = settingsArray.find(setting => event.key.toLowerCase() === setting.key);
            
            // If a match is found, we execute the panic action.
            if (matchedSetting) {
                console.log("SUCCESS: Panic key detected!", matchedSetting);
                
                // This prevents the browser from performing the default action for the key press.
                event.preventDefault();
                
                // The 'url' property holds the destination URL.
                window.location.href = matchedSetting.url;
            }
        }
    });
}

// --- Main Execution Logic ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Debug: DOMContentLoaded event fired. The page is ready.");
    try {
        const db = await openDB();
        const settings = await getSettings(db);

        if (settings && settings.length > 0) {
            console.log(`Debug: ${settings.length} panic key settings FOUND in IndexedDB.`, settings);
            addPanicKeyListener(settings);
        } else {
            console.log("Debug: No panic key settings found in IndexedDB.");
        }
        db.close();
    } catch (error) {
        console.error("FATAL ERROR: Could not initialize panic key from IndexedDB:", error);
    }
});
