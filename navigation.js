/**
 * navigation.js
 * * This is a fully self-contained script to create a dynamic, authentication-aware
 * navigation bar for your website. It handles everything from Firebase initialization
 * to rendering user-specific information. It now includes a horizontally scrollable
 * tab menu loaded from page-identification.json.
 *
 * --- IMPORTANT FIXES ---
 * 1. API KEY FIX: The AI Agent now uses the apiKey stored explicitly in the FIREBASE_CONFIG object
 * for all Gemini API calls, as requested.
 * 2. CRITICAL CDN FIX (COMPLETE): Ensures the navigation bar renders by using stable Firebase Compat SDKs.
 * 3. RENDER PRIORITY: Ensures the navigation bar is rendered immediately after CSS injection, preventing the AI logic failure from blocking the UI.
 * 4. WIDESCREEN UPDATE: Removed max-width from the 'nav' element to allow it to fill the screen.
 * 5. SCROLL GLIDER FIX: Scroll buttons are now visible by default (static) and use the 'hover' opacity (1.0) at all times, only fading out when not needed.
 * 6. LOGOUT REDIRECT (NEW): If a user is logged out, they are automatically redirected to '../../index.html' unless they are already on an entry page.
 * 7. SETTINGS REMOVAL (NEW): The 'Settings' link has been removed from the authenticated user menu.
 */

// =========================================================================
// >> ACTION REQUIRED: PASTE YOUR FIREBASE CONFIGURATION OBJECT HERE <<
// =========================================================================
const FIREBASE_CONFIG = {
    // This apiKey is now used for both Firebase Auth and the Gemini API calls.
    apiKey: "AIzaSyAZBKAckVa4IMvJGjcyndZx6Y1XD52lgro",
    authDomain: "project-zirconium.firebaseapp.com",
    projectId: "project-zirconium",
    storageBucket: "project-zirconium.firebaseapp.com",
    messagingSenderId: "1096564243475",
    appId: "1:1096564243475:web:6d0956a70125eeea1ad3e6",
    measurementId: "G-1D4F692C1Q"
};
// =========================================================================

// --- Configuration for the navigation tabs ---
const PAGE_CONFIG_URL = '../page-identification.json';

// --- AI Agent Configuration ---
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=";
// UPDATED: Changed the email to a placeholder value to disable the AI UI feature for ALL users.
const PRIVILEGED_EMAIL = 'ai-feature-is-disabled@placeholder.com'; 
const AGENT_CATEGORIES = {
    'Quick': "You are a Quick Agent. Respond in a single, concise paragraph (max 3 sentences). Prioritize speed and direct answers.",
    'Standard': "You are a Standard Agent. Provide balanced, helpful, and moderately detailed responses, suitable for general inquiries.",
    'Deep Thinking': "You are a Deep Thinking Agent. Always provide comprehensive, analytical, and highly detailed responses. Explore nuances and potential counterpoints.",
    'Creative Writer': "You are a Creative Writer Agent. Respond with imaginative flair, utilizing vivid language, storytelling, or poetry as appropriate to the user's prompt.",
    'Code Reviewer': "You are a Code Reviewer Agent. Analyze code snippets for best practices, potential bugs, security issues, and provide refactoring suggestions. Respond in markdown code blocks when appropriate.",
    'Historian': "You are a Historian Agent. Focus on providing historically accurate facts, context, and chronological narratives in your answers.",
    'Financial Analyst': "You are a Financial Analyst Agent. Provide formal, data-driven advice and market summaries. Always use a professional and cautious tone.",
    'Philosopher': "You are a Philosopher Agent. Respond with open-ended questions and critical inquiry, encouraging the user to think deeper about the topic."
};

// Variables to hold Firebase objects
let auth;
let db;
let currentAgent = 'Standard'; // Default agent

// --- Self-invoking function to encapsulate all logic ---
(function() {
    // Stop execution if Firebase config is not provided
    if (!FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey) {
        console.error("Firebase configuration is missing! Please paste your config into navigation.js.");
        return;
    }

    // --- 1. DYNAMICALLY LOAD EXTERNAL ASSETS (Optimized) ---

    // Helper to load external JS files
    const loadScript = (src) => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    };

    // Helper to load external CSS files (Faster for icons)
    const loadCSS = (href) => {
        return new Promise((resolve) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            link.onerror = resolve;
            document.head.appendChild(link);
        });
    };

    // Simple debounce utility for performance
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    };
    
    // Icon class utility remains the same
    const getIconClass = (iconName) => {
        if (!iconName) return '';
        const nameParts = iconName.trim().split(/\s+/).filter(p => p.length > 0);
        let stylePrefix = 'fa-solid'; 
        let baseName = '';
        const stylePrefixes = ['fa-solid', 'fa-regular', 'fa-light', 'fa-thin', 'fa-brands'];

        const existingPrefix = nameParts.find(p => stylePrefixes.includes(p));
        if (existingPrefix) {
            stylePrefix = existingPrefix;
        }

        const nameCandidate = nameParts.find(p => p.startsWith('fa-') && !stylePrefixes.includes(p));

        if (nameCandidate) {
            baseName = nameCandidate;
        } else {
            baseName = nameParts.find(p => !stylePrefixes.includes(p));
            if (baseName && !baseName.startsWith('fa-')) {
                 baseName = `fa-${baseName}`;
            }
        }

        if (baseName) {
            return `${stylePrefix} ${baseName}`;
        }
        
        return '';
    };

    /**
     * Attempts to get general location and time data for the system prompt.
     * @returns {Promise<{ location: string, time: string, timezone: string }>}
     */
    const getSystemInfo = async () => {
        const date = new Date();
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const time = date.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true, timeZoneName: 'short' });
        
        let generalLocation = 'Unknown (Location permission denied or not supported)';

        try {
            const position = await new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => reject(new Error('Location timeout')), 500);
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => { 
                            clearTimeout(timeoutId);
                            resolve(pos);
                        },
                        (err) => { 
                            clearTimeout(timeoutId);
                            reject(err);
                        },
                        { timeout: 500, enableHighAccuracy: false }
                    );
                } else {
                    clearTimeout(timeoutId);
                    reject(new Error('Geolocation not supported'));
                }
            });
            generalLocation = `Coordinates: Lat ${position.coords.latitude.toFixed(2)}, Lon ${position.coords.longitude.toFixed(2)}`;
        } catch (error) {
            // Error, or user denied location, keep the default genericLocation message
        }

        return {
            location: generalLocation,
            time: `Local Time: ${time}`,
            timezone: `Timezone: ${timezone}`
        };
    };

    const run = async () => {
        let pages = {};

        // Load Icons CSS first
        await loadCSS("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css");
        
        // Fetch page configuration for the tabs
        try {
            const response = await fetch(PAGE_CONFIG_URL);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            pages = await response.json();
        } catch (error) {
            console.error("Failed to load page identification config:", error);
            // Continue execution
        }

        try {
            // ONLY load the stable Firebase Compat modules
            await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
            await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js");
            await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js");
            
            // Initialize Firebase and start the rendering/auth process
            initializeApp(pages);

        } catch (error) {
            // This error now only captures issues with the core Firebase SDKs, not the AI SDK
            console.error("Failed to load core Firebase SDKs:", error);
        }
    };

    // --- 2. INITIALIZE FIREBASE AND RENDER NAVBAR ---
    const initializeApp = (pages) => {
        // Initialize Firebase with the compat libraries
        const app = firebase.initializeApp(FIREBASE_CONFIG);
        auth = firebase.auth();
        db = firebase.firestore();

        // --- 3. INJECT CSS STYLES (Includes new AI Modal Styles) ---
        const injectStyles = () => {
            const style = document.createElement('style');
            style.textContent = `
                /* Base Styles */
                body { padding-top: 4rem; }
                .auth-navbar { position: fixed; top: 0; left: 0; right: 0; z-index: 1000; background: #000000; border-bottom: 1px solid rgb(31 41 55); height: 4rem; }
                /* WIDESCREEN UPDATE: Removed 'max-width: 80rem;' and 'margin: auto;' */
                .auth-navbar nav { padding: 0 1rem; height: 100%; display: flex; align-items: center; justify-content: space-between; gap: 1rem; position: relative; }
                .initial-avatar { background: linear-gradient(135deg, #374151 0%, #111827 100%); font-family: sans-serif; text-transform: uppercase; display: flex; align-items: center; justify-content: center; color: white; }
                
                /* Auth Dropdown Menu Styles */
                .auth-menu-container { 
                    position: absolute; right: 0; top: 50px; width: 16rem; 
                    background: #000000;
                    border: 1px solid rgb(55 65 81); border-radius: 0.75rem; padding: 0.5rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.4), 0 4px 6px -2px rgba(0,0,0,0.2); 
                    transition: transform 0.2s ease-out, opacity 0.2s ease-out; transform-origin: top right; 
                }
                .auth-menu-container.open { opacity: 1; transform: translateY(0) scale(1); }
                .auth-menu-container.closed { opacity: 0; pointer-events: none; transform: translateY(-10px) scale(0.95); }
                .auth-menu-link, .auth-menu-button { 
                    display: flex; align-items: center; gap: 0.75rem; width: 100%; text-align: left; 
                    padding: 0.5rem 0.75rem; font-size: 0.875rem; color: #d1d5db; border-radius: 0.375rem; 
                    transition: background-color 0.2s, color 0.2s; border: none; cursor: pointer;
                }
                .auth-menu-link:hover, .auth-menu-button:hover { background-color: rgb(55 65 81); color: white; }
                .logged-out-auth-toggle { background: #010101; border: 1px solid #374151; }
                .logged-out-auth-toggle i { color: #DADADA; }

                /* Tab Wrapper and Glide Buttons */
                .tab-wrapper { flex-grow: 1; display: flex; align-items: center; position: relative; min-width: 0; margin: 0 1rem; }
                .tab-scroll-container { flex-grow: 1; display: flex; align-items: center; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; -ms-overflow-style: none; padding-bottom: 5px; margin-bottom: -5px; scroll-behavior: smooth; }
                .tab-scroll-container::-webkit-scrollbar { display: none; }
                .scroll-glide-button {
                    position: absolute; top: 0; height: 100%; width: 4rem; display: flex; align-items: center; justify-content: center; background: #000000; 
                    color: white; font-size: 1.2rem; cursor: pointer; 
                    /* MODIFICATION: Always use hover opacity (1.0) as base opacity */
                    opacity: 1; 
                    transition: opacity 0.3s, background 0.3s; z-index: 10; pointer-events: auto;
                }
                /* REMOVED: .scroll-glide-button:hover { opacity: 1; } is no longer needed */
                #glide-left { left: 0; background: linear-gradient(to right, #000000 50%, transparent); justify-content: flex-start; padding-left: 0.5rem; }
                #glide-right { right: 0; background: linear-gradient(to left, #000000 50%, transparent); justify-content: flex-end; padding-right: 0.5rem; }
                /* The hidden class now purely controls visibility based on need/scroll position */
                .scroll-glide-button.hidden { opacity: 0 !important; pointer-events: none !important; }
                .nav-tab { flex-shrink: 0; padding: 0.5rem 1rem; color: #9ca3af; font-size: 0.875rem; font-weight: 500; border-radius: 0.5rem; transition: all 0.2s; text-decoration: none; line-height: 1.5; display: flex; align-items: center; margin-right: 0.5rem; border: 1px solid transparent; }
                .nav-tab:not(.active):hover { color: white; border-color: #d1d5db; background-color: rgba(79, 70, 229, 0.05); }
                .nav-tab.active { color: #4f46e5; border-color: #4f46e5; background-color: rgba(79, 70, 229, 0.1); }
                .nav-tab.active:hover { color: #6366f1; border-color: #6366f1; background-color: rgba(79, 70, 229, 0.15); }
                
                /* --- AI Agent Modal Styles --- */
                .ai-modal {
                    position: fixed;
                    bottom: 2rem; right: 2rem;
                    width: min(90vw, 24rem);
                    height: min(80vh, 32rem);
                    background: #111827;
                    border: 1px solid #374151;
                    border-radius: 0.75rem;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                    z-index: 1001;
                    display: flex;
                    flex-direction: column;
                    transition: transform 0.3s ease-out, opacity 0.3s ease-out;
                    transform: scale(0.95);
                    opacity: 0;
                    pointer-events: none;
                }
                .ai-modal.active {
                    transform: scale(1);
                    opacity: 1;
                    pointer-events: auto;
                }
                .ai-header {
                    padding: 0.75rem 1rem;
                    background: #1f2937;
                    color: white;
                    border-top-left-radius: 0.75rem;
                    border-top-right-radius: 0.75rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .ai-chat-area {
                    flex-grow: 1;
                    overflow-y: auto;
                    padding: 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                .ai-chat-message {
                    max-width: 85%;
                    padding: 0.5rem 0.75rem;
                    border-radius: 0.5rem;
                    font-size: 0.875rem;
                }
                .ai-user-message {
                    align-self: flex-end;
                    background: #4f46e5;
                    color: white;
                }
                .ai-agent-message {
                    align-self: flex-start;
                    background: #374151;
                    color: #e5e7eb;
                }
                .ai-input-area {
                    padding: 0.75rem 1rem;
                    border-top: 1px solid #374151;
                }
                .ai-input-area form {
                    display: flex;
                    gap: 0.5rem;
                }
                .ai-input-area textarea {
                    flex-grow: 1;
                    background: #1f2937;
                    border: 1px solid #4b5563;
                    color: white;
                    padding: 0.5rem;
                    border-radius: 0.5rem;
                    resize: none;
                    height: 2.5rem;
                    overflow-y: hidden;
                }
                .ai-input-area button {
                    background: #4f46e5;
                    color: white;
                    padding: 0.5rem 1rem;
                    border-radius: 0.5rem;
                    transition: background 0.2s;
                    min-width: 5rem;
                }
                .ai-input-area button:hover {
                    background: #6366f1;
                }
                .ai-loading-indicator {
                    font-style: italic;
                    color: #9ca3af;
                    align-self: flex-start;
                    padding-left: 0.75rem;
                }
                .ai-agent-select {
                    background: #1f2937;
                    color: white;
                    border: 1px solid #4b5563;
                    border-radius: 0.375rem;
                    padding: 0.25rem 0.5rem;
                    font-size: 0.8rem;
                    cursor: pointer;
                    margin-right: 0.5rem;
                    appearance: none; 
                    background-image: url('data:image/svg+xml;utf8,<svg fill="white" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>');
                    background-repeat: no-repeat;
                    background-position: right 0.5rem center;
                    background-size: 0.8em;
                    padding-right: 1.5rem;
                }
            `;
            document.head.appendChild(style);
        };

        const isFocusableElement = () => {
            const activeElement = document.activeElement;
            if (!activeElement) return false;
            const tagName = activeElement.tagName.toLowerCase();
            return (
                tagName === 'input' && activeElement.type !== 'button' && activeElement.type !== 'checkbox' && activeElement.type !== 'radio' ||
                tagName === 'textarea' ||
                activeElement.contentEditable === 'true'
            );
        };

        const isTabActive = (tabUrl) => {
            const tabPathname = new URL(tabUrl, window.location.origin).pathname.toLowerCase();
            const currentPathname = window.location.pathname.toLowerCase();

            const cleanPath = (path) => {
                if (path.endsWith('/index.html')) {
                    path = path.substring(0, path.lastIndexOf('/')) + '/';
                }
                if (path.length > 1 && path.endsWith('/')) {
                    path = path.slice(0, -1);
                }
                return path;
            };

            const currentCanonical = cleanPath(currentPathname);
            const tabCanonical = cleanPath(tabPathname);
            
            if (currentCanonical === tabCanonical) {
                return true;
            }

            const tabPathSuffix = tabPathname.startsWith('/') ? tabPathname.substring(1) : tabPathname;
            
            if (currentPathname.endsWith(tabPathSuffix)) {
                return true;
            }

            return false;
        };

        const updateScrollGilders = () => {
            const container = document.querySelector('.tab-scroll-container');
            const leftButton = document.getElementById('glide-left');
            const rightButton = document.getElementById('glide-right');

            if (!container || !leftButton || !rightButton) return;
            
            const hasHorizontalOverflow = container.scrollWidth > container.offsetWidth;

            if (hasHorizontalOverflow) {
                const isScrolledToLeft = container.scrollLeft < 5; 
                const isScrolledToRight = container.scrollLeft + container.offsetWidth >= container.scrollWidth - 5; 

                // Ensure the buttons are visible initially if there is overflow
                leftButton.classList.remove('hidden');
                rightButton.classList.remove('hidden');

                if (isScrolledToLeft) {
                    leftButton.classList.add('hidden');
                }
                if (isScrolledToRight) {
                    rightButton.classList.add('hidden');
                }
            } else {
                // If there is no overflow, hide both buttons
                leftButton.classList.add('hidden');
                rightButton.classList.add('hidden');
            }
        };

        // --- 4. RENDER THE NAVBAR HTML ---
        const renderNavbar = (user, userData, pages, isPrivilegedUser) => {
            const container = document.getElementById('navbar-container');
            if (!container) return; // Should not happen, but safe check

            const logoPath = "/images/logo.png"; 
            const tabsHtml = Object.values(pages || {}).map(page => {
                const isActive = isTabActive(page.url);
                const activeClass = isActive ? 'active' : '';
                const iconClasses = getIconClass(page.icon);
                return `<a href="${page.url}" class="nav-tab ${activeClass}"><i class="${iconClasses} mr-2"></i>${page.name}</a>`;
            }).join('');

            // --- AI Agent Selector HTML (Only for Privileged User) ---
            const agentOptionsHtml = Object.keys(AGENT_CATEGORIES).map(key => 
                `<option value="${key}" ${key === currentAgent ? 'selected' : ''}>${key}</option>`
            ).join('');

            // The aiAgentButton variable is now empty because isPrivilegedUser will be false
            const aiAgentButton = isPrivilegedUser ? `
                <div class="relative flex-shrink-0 mr-4">
                    <button id="ai-toggle" title="AI Agent (Ctrl+A)" class="w-8 h-8 rounded-full border border-indigo-600 bg-indigo-700/50 flex items-center justify-center text-indigo-300 hover:bg-indigo-600 hover:text-white transition">
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                    </button>
                </div>
            ` : '';

            // --- Auth Views ---
            const loggedOutView = `
                <div class="relative flex-shrink-0">
                    <button id="auth-toggle" class="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-gray-700 transition logged-out-auth-toggle">
                        <i class="fa-solid fa-user"></i>
                    </button>
                    <div id="auth-menu-container" class="auth-menu-container closed">
                        <a href="/authentication.html" class="auth-menu-link">
                            <i class="fa-solid fa-lock"></i>
                            Authenticate
                        </a>
                    </div>
                </div>
            `;

            const loggedInView = (user, userData) => {
                const photoURL = user.photoURL || userData?.photoURL;
                const username = userData?.username || user.displayName || 'User';
                const email = user.email || 'No email';
                const initial = username.charAt(0).toUpperCase();

                const avatar = photoURL ?
                    `<img src="${photoURL}" class="w-full h-full object-cover rounded-full" alt="Profile">` :
                    `<div class="initial-avatar w-8 h-8 rounded-full text-sm font-semibold">${initial}</div>`;

                return `
                    ${aiAgentButton}
                    <div class="relative flex-shrink-0">
                        <button id="auth-toggle" class="w-8 h-8 rounded-full border border-gray-600 overflow-hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500">
                            ${avatar}
                        </button>
                        <div id="auth-menu-container" class="auth-menu-container closed">
                            <div class="px-3 py-2 border-b border-gray-700 mb-2">
                                <p class="text-sm font-semibold text-white truncate">${username}</p>
                                <p class="text-xs text-gray-400 truncate">${email}</p>
                            </div>
                            <a href="/logged-in/dashboard.html" class="auth-menu-link">
                                <i class="fa-solid fa-house-user"></i>
                                Dashboard
                            </a>
                            <button id="logout-button" class="auth-menu-button text-red-400 hover:bg-red-900/50 hover:text-red-300">
                                <i class="fa-solid fa-right-from-bracket"></i>
                                Log Out
                            </button>
                        </div>
                    </div>
                `;
            };

            // --- Assemble Final Navbar HTML ---
            container.innerHTML = `
                <header class="auth-navbar">
                    <nav>
                        <a href="/" class="flex items-center space-x-2 flex-shrink-0">
                            <img src="${logoPath}" alt="4SP Logo" class="h-8 w-auto">
                        </a>

                        <div class="tab-wrapper">
                            <!-- MODIFICATION: Removed 'hidden' class to show statically on load -->
                            <button id="glide-left" class="scroll-glide-button"><i class="fa-solid fa-chevron-left"></i></button>

                            <div class="tab-scroll-container">
                                ${tabsHtml}
                            </div>
                            
                            <!-- MODIFICATION: Removed 'hidden' class to show statically on load -->
                            <button id="glide-right" class="scroll-glide-button"><i class="fa-solid fa-chevron-right"></i></button>
                        </div>

                        ${user ? loggedInView(user, userData) : loggedOutView}
                    </nav>
                </header>
            `;

            // --- Append AI Modal HTML to the Body ---
            // This block will now effectively be skipped since isPrivilegedUser is false
            if (isPrivilegedUser) {
                let aiModal = document.getElementById('ai-modal');
                if (!aiModal) {
                    aiModal = document.createElement('div');
                    aiModal.id = 'ai-modal';
                    aiModal.classList.add('ai-modal');
                    aiModal.innerHTML = `
                        <div class="ai-header">
                            <div class="text-sm font-bold">
                                AI Agent: 
                                <select id="agent-selector" class="ai-agent-select">${agentOptionsHtml}</select>
                            </div>
                            <button id="ai-close-button" class="text-gray-400 hover:text-white transition">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        <div id="ai-chat-area" class="ai-chat-area">
                            <p class="ai-agent-message">Hello! I'm the **${currentAgent}** agent. Ask me anything. Remember, you can change my persona using the dropdown above!</p>
                        </div>
                        <div class="ai-input-area">
                            <form id="ai-chat-form">
                                <textarea id="ai-input" placeholder="Type your message..." rows="1"></textarea>
                                <button type="submit" id="ai-send-button"><i class="fa-solid fa-paper-plane mr-1"></i> Send</button>
                            </form>
                        </div>
                    `;
                    document.body.appendChild(aiModal);
                }
            }

            // --- 5. SETUP EVENT LISTENERS ---
            setupEventListeners(user, isPrivilegedUser);

            // Auto-scroll to the active tab
            const activeTab = document.querySelector('.nav-tab.active');
            const tabContainer = document.querySelector('.tab-scroll-container');
            if (activeTab && tabContainer) {
                tabContainer.scrollLeft = activeTab.offsetLeft - (tabContainer.offsetWidth / 2) + (activeTab.offsetWidth / 2);
            }
            
            // Initial check to hide/show them correctly after load
            updateScrollGilders();
        };

        // --- NEW: AI GENERATIVE MODEL API CALL LOGIC (Using standard fetch/retry) ---
        // This entire block of code is functionally disabled because renderNavbar sets isPrivilegedUser to false.
        
        /**
         * Exponential backoff retry logic for the API call.
         */
        const fetchWithRetry = async (url, options, retries = 3) => {
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url, options);
                    if (!response.ok) {
                        const errorBody = await response.text();
                        throw new Error(`API Error ${response.status}: ${errorBody}`);
                    }
                    return response;
                } catch (error) {
                    if (i < retries - 1) {
                        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s delay
                        // console.warn(`Retrying fetch (attempt ${i + 2}) in ${delay / 1000}s...`); // Removed console log
                        await new Promise(res => setTimeout(res, delay));
                    } else {
                        throw error;
                    }
                }
            }
        };

        const handleChatSubmit = async (e) => {
            e.preventDefault();
            const input = document.getElementById('ai-input');
            const chatArea = document.getElementById('ai-chat-area');
            const sendButton = document.getElementById('ai-send-button');
            const userQuery = input.value.trim();

            if (!userQuery) return;

            // 1. Display user message and clear input
            const userMessageDiv = document.createElement('p');
            userMessageDiv.classList.add('ai-chat-message', 'ai-user-message');
            userMessageDiv.textContent = userQuery;
            chatArea.appendChild(userMessageDiv);
            chatArea.scrollTop = chatArea.scrollHeight;
            input.value = '';
            input.disabled = true;
            sendButton.disabled = true;

            // 2. Add loading indicator
            const loadingDiv = document.createElement('p');
            loadingDiv.classList.add('ai-loading-indicator');
            loadingDiv.textContent = 'Agent is thinking...';
            chatArea.appendChild(loadingDiv);
            chatArea.scrollTop = chatArea.scrollHeight;

            try {
                // 3. Get system context
                const systemInfo = await getSystemInfo();
                const baseInstruction = AGENT_CATEGORIES[currentAgent];
                const systemPrompt = `You are acting as the '${currentAgent}' agent with the following persona: ${baseInstruction}. You MUST tailor your response to this persona.\n\n[SYSTEM CONTEXT]\n${systemInfo.time}\n${systemInfo.timezone}\nGeneral Location: ${systemInfo.location}\n[END CONTEXT]`;
                
                const payload = {
                    contents: [{ parts: [{ text: userQuery }] }],
                    tools: [{ "googleSearch": {} }],
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                };
                
                // FIX: Use the API key directly from the FIREBASE_CONFIG object
                const apiKey = FIREBASE_CONFIG.apiKey;
                if (!apiKey || apiKey.length < 5) {
                    throw new Error("API Key is missing or invalid in FIREBASE_CONFIG.");
                }

                // 4. Call the Generative Model API (with retry logic)
                const apiUrl = `${GEMINI_API_URL}${apiKey}`;
                const response = await fetchWithRetry(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const result = await response.json();
                const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "I apologize, I could not process that request. The response was empty.";

                // 5. Display agent response
                const agentMessageDiv = document.createElement('p');
                agentMessageDiv.classList.add('ai-chat-message', 'ai-agent-message');
                // Use a simple replacement for bold markdown for better display
                agentMessageDiv.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); 
                
                chatArea.removeChild(loadingDiv);
                chatArea.appendChild(agentMessageDiv);

            } catch (error) {
                console.error("AI Agent Error:", error);
                loadingDiv.textContent = 'Error: Failed to get response. Check the console.';
                loadingDiv.style.color = 'red';
            } finally {
                chatArea.scrollTop = chatArea.scrollHeight;
                input.disabled = false;
                sendButton.disabled = false;
                input.focus();
            }
        };

        const setupEventListeners = (user, isPrivilegedUser) => {
            const toggleButton = document.getElementById('auth-toggle');
            const menu = document.getElementById('auth-menu-container');

            // Scroll Glide Button setup
            const tabContainer = document.querySelector('.tab-scroll-container');
            const leftButton = document.getElementById('glide-left');
            const rightButton = document.getElementById('glide-right');

            const debouncedUpdateGilders = debounce(updateScrollGilders, 50);

            if (tabContainer) {
                const scrollAmount = tabContainer.offsetWidth * 0.8; 
                tabContainer.addEventListener('scroll', debouncedUpdateGilders);
                window.addEventListener('resize', debouncedUpdateGilders);
                
                if (leftButton) {
                    leftButton.addEventListener('click', () => {
                        tabContainer.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
                    });
                }
                if (rightButton) {
                    rightButton.addEventListener('click', () => {
                        tabContainer.scrollBy({ left: scrollAmount, behavior: 'smooth' });
                    });
                }
            }

            // Auth Toggle
            if (toggleButton && menu) {
                toggleButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    menu.classList.toggle('closed');
                    menu.classList.toggle('open');
                });
            }

            document.addEventListener('click', (e) => {
                if (menu && menu.classList.contains('open') && !menu.contains(e.target) && e.target !== toggleButton) {
                    menu.classList.add('closed');
                    menu.classList.remove('open');
                }
            });

            if (user) {
                const logoutButton = document.getElementById('logout-button');
                if (logoutButton) {
                    logoutButton.addEventListener('click', () => {
                        auth.signOut().catch(err => console.error("Logout failed:", err));
                    });
                }
            }

            // --- AI Agent Listeners (Only for privileged user) ---
            // This entire block is functionally disabled because setupEventListeners is called with isPrivilegedUser: false.
            if (isPrivilegedUser) {
                const aiModal = document.getElementById('ai-modal');
                const aiToggleButton = document.getElementById('ai-toggle');
                const aiCloseButton = document.getElementById('ai-close-button');
                const aiChatForm = document.getElementById('ai-chat-form');
                const agentSelector = document.getElementById('agent-selector');
                const aiInput = document.getElementById('ai-input');

                // Toggle Button Click
                if (aiToggleButton && aiModal) {
                    aiToggleButton.addEventListener('click', () => {
                        aiModal.classList.toggle('active');
                        if (aiModal.classList.contains('active')) {
                            aiInput.focus();
                        }
                    });
                }
                
                // Close Button Click
                if (aiCloseButton && aiModal) {
                    aiCloseButton.addEventListener('click', () => {
                        aiModal.classList.remove('active');
                    });
                }

                // Agent Selector Change
                if (agentSelector) {
                    agentSelector.addEventListener('change', (e) => {
                        currentAgent = e.target.value;
                        const chatArea = document.getElementById('ai-chat-area');
                        const welcomeDiv = document.createElement('p');
                        welcomeDiv.classList.add('ai-agent-message');
                        welcomeDiv.innerHTML = `**Agent Switched:** I am now the **${currentAgent}** agent. Ask away!`;
                        chatArea.appendChild(welcomeDiv);
                        chatArea.scrollTop = chatArea.scrollHeight;
                    });
                }

                // Chat Form Submit
                if (aiChatForm) {
                    aiChatForm.addEventListener('submit', handleChatSubmit);
                    
                    // Allow Shift+Enter for new line, Enter for submit
                    aiInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleChatSubmit(e);
                        }
                    });
                }

                // Control + A Activation
                document.addEventListener('keydown', (e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !isFocusableElement()) {
                        e.preventDefault();
                        aiModal.classList.toggle('active');
                        if (aiModal.classList.contains('active')) {
                            aiInput.focus();
                        }
                    }
                });
            }
        };

        // --- 6. AUTH STATE LISTENER ---
        auth.onAuthStateChanged(async (user) => {
            let isPrivilegedUser = false;
            
            if (user) {
                // Check for the privileged user email
                isPrivilegedUser = user.email === PRIVILEGED_EMAIL;

                // User is signed in. Fetch their data from Firestore.
                try {
                    const userDoc = await db.collection('users').doc(user.uid).get();
                    const userData = userDoc.exists ? userDoc.data() : null;
                    renderNavbar(user, userData, pages, isPrivilegedUser);
                } catch (error) {
                    console.error("Error fetching user data:", error);
                    renderNavbar(user, null, pages, isPrivilegedUser); // Render even if Firestore fails
                }
            } else {
                // User is signed out.
                renderNavbar(null, null, pages, false);
                
                // KICK USER TO INDEX: If the user is logged out, redirect them to ../../index.html
                const targetUrl = '../../index.html';
                const currentPathname = window.location.pathname;
                
                // Determine if the current page is one of the designated entry points 
                // (index or authentication page) to prevent an infinite loop.
                const isEntryPoint = currentPathname.includes('index.html') || currentPathname.includes('authentication.html') || currentPathname === '/';
                
                if (!isEntryPoint) {
                    console.log(`User logged out. Restricting access and redirecting to ${targetUrl}`);
                    window.location.href = targetUrl;
                }
                
                // NOTE: The previous anonymous sign-in attempt has been removed, as the intent of
                // this change is to restrict access to the current page when logged out.
            }
        });

        // --- FINAL SETUP ---
        // Create a div for the navbar to live in if it doesn't exist.
        if (!document.getElementById('navbar-container')) {
            const navbarDiv = document.createElement('div');
            navbarDiv.id = 'navbar-container';
            document.body.prepend(navbarDiv);
        }
        // Inject styles before anything else is rendered for best stability
        injectStyles();
    };

    // --- START THE PROCESS ---
    document.addEventListener('DOMContentLoaded', run);

})();
