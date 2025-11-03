/**
 * navigation.js
 * * This is a fully self-contained script to create a dynamic, authentication-aware
 * navigation bar for your website. It handles everything from Firebase initialization
 * to rendering user-specific information. It now includes a horizontally scrollable
 * tab menu loaded from page-identification.json.
 *
 * --- UPDATES & FEATURES ---
 * 1. ADMIN EMAIL SET: The privileged email is set to 4simpleproblems@gmail.com.
 * 2. AI FEATURES REMOVED: All AI-related code has been removed.
 * 3. GOLD ADMIN TAB REMOVED: The 'Beta Settings' tab no longer has a special texture.
 * 4. SETTINGS LINK: Includes the 'Settings' link in the authenticated user's dropdown menu.
 * 5. ACTIVE TAB SCROLL: Now scrolls the active tab to the center only on the initial page load, preventing unwanted centering during subsequent re-renders (like sign-in/out).
 * 6. LOGOUT REDIRECT: **UPDATED** to enforce redirect from protected pages AND sub-repository index pages (like /GAMES/index.html).
 * 7. PIN BUTTON: Adds a persistent 'Pin' button next to the auth icon for quick page access.
 * 8. GLIDE FADE UPDATED: Glide button fade now spans the full navbar height smoothly.
 * 9. INSTANT GLIDE: Scroll-end glide buttons (arrows) now update instantly with no delay.
 * 10. PIN HINT: A one-time hint now appears on first click of the pin button.
 * 11. PIN ICON: Pin icon is now solid at all times (hover effect removed).
 * 12. SCROLL PERSISTENCE: The scroll position is now saved and restored using requestAnimationFrame during re-renders.
 */

// Global variables (must be present in the environment)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Firebase and UI Constants
const ADMIN_EMAIL = '4simpleproblems@gmail.com';
const AUTH_KEY = `auth_status_${appId}`; // Key for auth status persistence
const PIN_HINT_KEY = `pin_hint_shown_${appId}`;
const PINNED_PAGES_KEY = `pinned_pages_${appId}`;
const SCROLL_POS_KEY = `scroll_pos_${appId}`;
const INTRO_KEY = `intro_complete_${appId}`;
const DEFAULT_PAGES = [
    { title: "Home", url: "index.html", icon: "fa-home", isPublic: true },
    { title: "Settings", url: "settings.html", icon: "fa-cog", isPublic: false },
    { title: "Admin Panel", url: "admin.html", icon: "fa-shield-alt", isAdmin: true },
];

// Load necessary Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    getDoc, 
    setDoc, 
    query, 
    where, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global Firebase instances
let app, db, auth;
let userId = null;
let isAdmin = false;
let pages = [];
let pinnedPages = [];
let isAuthReady = false;
let activeTabElement = null;
let isFirstRender = true;
let isScrollingProgrammatically = false;


// --- Utility Functions ---

/** Loads page list and authentication status, then renders the navbar. */
const loadPagesAndRender = async (user) => {
    try {
        // Step 1: Initialize pages with defaults
        pages = [...DEFAULT_PAGES];

        // Step 2: Determine user status
        userId = user ? user.uid : null;
        isAdmin = user && user.email === ADMIN_EMAIL;
        
        // Step 3: Load remote pages (if available)
        if (db) {
            const pagesCollectionRef = collection(db, `artifacts/${appId}/public/data/pages`);
            const pagesSnapshot = await getDocs(pagesCollectionRef);
            
            if (!pagesSnapshot.empty) {
                const remotePages = pagesSnapshot.docs.map(doc => doc.data());
                // Filter out duplicates based on title and merge, keeping remote pages first
                const mergedPages = [...remotePages, ...DEFAULT_PAGES.filter(def => !remotePages.some(rem => rem.title === def.title))];
                pages = mergedPages.sort((a, b) => (a.order || 99) - (b.order || 99));
            }
        }
        
        // Step 4: Load pinned pages from localStorage
        const storedPins = localStorage.getItem(PINNED_PAGES_KEY);
        if (storedPins) {
            pinnedPages = JSON.parse(storedPins);
        } else {
            pinnedPages = [];
        }

    } catch (error) {
        console.error("Error loading pages from Firestore:", error);
        // Fallback to default pages if loading fails
        pages = [...DEFAULT_PAGES];
    } finally {
        isAuthReady = true;
        renderNavbar(); // Always render the navbar regardless of success/failure
    }
};

/** Handles user sign-in/sign-up. */
const handleAuth = async () => {
    try {
        if (!initialAuthToken) {
            // Sign in anonymously if no custom token is provided
            await signInAnonymously(auth);
        } else {
            // Sign in with the provided custom token
            await signInWithCustomToken(auth, initialAuthToken);
        }
    } catch (error) {
        console.error("Firebase Auth Error:", error);
    }
};

/** Saves the pinned pages array to localStorage. */
const savePinnedPages = () => {
    localStorage.setItem(PINNED_PAGES_KEY, JSON.stringify(pinnedPages));
    renderNavbar(); // Re-render to update the list
};

/** Adds or removes a page from the pinned list. */
const togglePinPage = (pageTitle) => {
    const pageToPin = pages.find(p => p.title === pageTitle);

    if (!pageToPin) return;

    const index = pinnedPages.findIndex(p => p.title === pageTitle);

    if (index === -1) {
        // Add to pinned list
        pinnedPages.push(pageToPin);
        
        // Show one-time hint on first pin
        if (localStorage.getItem(PIN_HINT_KEY) !== 'true') {
            showPinHint();
            localStorage.setItem(PIN_HINT_KEY, 'true');
        }
    } else {
        // Remove from pinned list
        pinnedPages.splice(index, 1);
    }
    savePinnedPages();
};

/** Shows the one-time hint for pinning pages. */
const showPinHint = () => {
    const pinHint = document.createElement('div');
    pinHint.id = 'pin-hint';
    pinHint.className = 'fixed top-16 right-4 z-50 bg-accent-indigo text-white p-3 rounded-xl shadow-lg transition-opacity duration-300 opacity-0 transform translate-y-2';
    pinHint.innerHTML = `
        <i class="fas fa-thumbtack mr-2"></i> Pinned pages show up here for quick access!
    `;
    document.body.appendChild(pinHint);

    // Fade in
    setTimeout(() => {
        pinHint.style.opacity = '1';
        pinHint.style.transform = 'translateY(0)';
    }, 10);

    // Fade out and remove
    setTimeout(() => {
        pinHint.style.opacity = '0';
        pinHint.style.transform = 'translateY(20px)';
        setTimeout(() => pinHint.remove(), 300);
    }, 5000);
};


// --- UI/Rendering Functions ---

/** Injects necessary styles into the head. */
const injectStyles = () => {
    if (document.getElementById('nav-styles')) return;

    const style = document.createElement('style');
    style.id = 'nav-styles';
    style.textContent = `
        .hide-scrollbar::-webkit-scrollbar {
            display: none;
        }
        .hide-scrollbar {
            -ms-overflow-style: none; /* IE and Edge */
            scrollbar-width: none; /* Firefox */
        }
        .nav-fade-left, .nav-fade-right {
            pointer-events: none;
            position: absolute;
            top: 0;
            height: 100%; /* Spans full navbar height */
            width: 4rem;
            opacity: 0;
            transition: opacity 0.3s;
            z-index: 10;
        }
        .nav-fade-left {
            left: 0;
            background: linear-gradient(to right, #070707, rgba(7, 7, 7, 0));
        }
        .nav-fade-right {
            right: 0;
            background: linear-gradient(to left, #070707, rgba(7, 7, 7, 0));
        }
        .nav-tab {
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            padding: 0.75rem 1.25rem;
            margin-right: 0.25rem;
            cursor: pointer;
            border-radius: 0.75rem;
            transition: background-color 0.2s, color 0.2s, transform 0.2s;
            font-weight: 400;
        }
        .nav-tab:hover {
            background-color: #1a1a1a;
        }
        .nav-tab.active {
            background-color: #4f46e5;
            color: #ffffff;
        }
        .dropdown-item {
            display: flex;
            align-items: center;
            padding: 0.5rem 1rem;
            cursor: pointer;
            transition: background-color 0.1s;
            border-radius: 0.5rem;
            white-space: nowrap;
        }
        .dropdown-item:hover {
            background-color: #1a1a1a;
        }
        .dropdown {
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 0.5rem;
            min-width: 12rem;
            background-color: #111111;
            border: 1px solid #252525;
            border-radius: 1rem;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
            padding: 0.5rem;
            z-index: 50;
        }
        .pin-button {
            transition: color 0.2s, background-color 0.2s;
            padding: 0.75rem;
            border-radius: 0.75rem;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        }
        .pin-button:hover {
            background-color: #1a1a1a;
        }
        .pin-button i.fa-thumbtack {
             color: #ffffff; /* Pin icon is solid white at all times */
        }
    `;
    document.head.appendChild(style);
};

/** Renders the main navigation bar. */
const renderNavbar = () => {
    // Save scroll position before re-rendering (unless it's the first time)
    const tabMenu = document.getElementById('tab-menu-scroller');
    const scrollPos = tabMenu ? tabMenu.scrollLeft : 0;
    if (!isFirstRender) {
        sessionStorage.setItem(SCROLL_POS_KEY, scrollPos);
    }
    
    const navbarContainer = document.getElementById('navbar-container');
    if (!navbarContainer) return;

    // --- Tab Filtering Logic ---
    const availablePages = pages.filter(page => {
        // If not authenticated, only show public pages
        if (!userId) {
            return page.isPublic === true;
        }
        // If authenticated, filter by admin status
        if (page.isAdmin) {
            return isAdmin;
        }
        return true;
    });

    // --- Active Page Identification ---
    const currentPath = window.location.pathname.split('/').pop();
    const activePage = availablePages.find(page => currentPath === page.url || (currentPath === '' && page.url === 'index.html'));

    // --- HTML Rendering ---
    const authIcon = userId ? `<i class="fas fa-user-circle text-2xl"></i>` : `<i class="fas fa-sign-in-alt text-xl"></i>`;
    const userDisplay = userId ? 
        `<div class="text-xs text-gray-400 truncate">${auth.currentUser?.email || 'Authenticated User'}</div>` : 
        `<div class="text-xs text-gray-400">Not Logged In</div>`;

    let tabMenuHTML = '';
    availablePages.forEach(page => {
        const isActive = activePage && page.title === activePage.title;
        const activeClass = isActive ? 'active' : '';
        tabMenuHTML += `
            <a href="${page.url}" class="nav-tab ${activeClass}" data-title="${page.title}">
                <i class="fas ${page.icon} mr-2"></i> ${page.title}
            </a>
        `;
    });

    let pinnedPagesHTML = '';
    pinnedPages.forEach(page => {
        const isActive = activePage && page.title === activePage.title;
        const activeClass = isActive ? 'active' : '';
        pinnedPagesHTML += `
            <a href="${page.url}" class="nav-tab ${activeClass} !p-3 !mr-1">
                <i class="fas ${page.icon} text-lg"></i>
            </a>
        `;
    });

    const isPinVisible = availablePages.length > 0;

    navbarContainer.innerHTML = `
        <nav class="bg-deep-black text-white p-3 border-b border-brand-border shadow-lg sticky top-0 z-40">
            <div class="max-w-7xl mx-auto flex justify-between items-center relative">

                <!-- Left Section: Logo/Title -->
                <a href="index.html" class="text-2xl font-bold tracking-tight text-white mr-6" style="font-weight: 400;">4SP Games</a>

                <!-- Center Section: Scrollable Tab Menu -->
                <div class="flex-grow min-w-0 max-w-full relative h-12">
                    <div id="tab-menu-scroller" class="flex overflow-x-scroll hide-scrollbar h-full items-center">
                        ${tabMenuHTML}
                    </div>
                    <!-- Glide Fades -->
                    <div id="fade-left" class="nav-fade-left opacity-0"></div>
                    <div id="fade-right" class="nav-fade-right opacity-0"></div>
                </div>

                <!-- Right Section: Pinned Pages, Auth Icon -->
                <div class="flex items-center space-x-2 ml-4 relative">
                    <!-- Pinned Pages -->
                    <div class="hidden sm:flex items-center space-x-1">
                        ${pinnedPagesHTML}
                    </div>

                    <!-- Pin Dropdown/Icon Button -->
                    ${isPinVisible ? `
                        <div id="pin-container" class="relative">
                            <button id="pin-dropdown-btn" class="pin-button text-white">
                                <i class="fas fa-thumbtack text-lg"></i>
                            </button>
                            <div id="pin-dropdown-menu" class="dropdown hidden">
                                <h3 class="text-sm font-semibold text-gray-300 px-3 pt-2 pb-1 border-b border-brand-border mb-1">Pin Pages</h3>
                                ${availablePages.map(page => `
                                    <div class="dropdown-item pin-toggle" data-title="${page.title}">
                                        <i class="fas ${pinnedPages.some(p => p.title === page.title) ? 'fa-check-square text-accent-indigo' : 'fa-square text-gray-500'} mr-3"></i>
                                        ${page.title}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Auth Icon and Dropdown -->
                    <div id="auth-container" class="relative">
                        <button id="auth-dropdown-btn" class="pin-button text-accent-indigo">
                            ${authIcon}
                        </button>
                        <div id="auth-dropdown-menu" class="dropdown hidden">
                            <div class="px-4 py-2 border-b border-brand-border mb-2">
                                ${userDisplay}
                                <div class="text-sm font-semibold">${userId ? auth.currentUser?.displayName || 'User ID' : 'Guest'}</div>
                            </div>
                            ${userId ? `
                                <a href="settings.html" class="dropdown-item">
                                    <i class="fas fa-cog w-5 mr-3"></i> Settings
                                </a>
                                <div id="logout-btn" class="dropdown-item text-red-400">
                                    <i class="fas fa-sign-out-alt w-5 mr-3"></i> Log Out
                                </div>
                            ` : `
                                <a href="authentication.html" class="dropdown-item">
                                    <i class="fas fa-sign-in-alt w-5 mr-3"></i> Sign In / Register
                                </a>
                            `}
                        </div>
                    </div>

                </div>
            </div>
        </nav>
    `;
    
    // --- Post-Render Setup ---
    const tabMenuScroller = document.getElementById('tab-menu-scroller');
    
    // Restore scroll position
    if (!isFirstRender) {
        requestAnimationFrame(() => {
            const savedScrollPos = sessionStorage.getItem(SCROLL_POS_KEY);
            if (savedScrollPos !== null) {
                tabMenuScroller.scrollLeft = parseInt(savedScrollPos, 10);
            }
        });
    }

    // --- Event Listeners and Scroll Handling ---

    // 1. Dropdown Toggle Logic (Auth and Pin)
    const toggleDropdown = (btnId, menuId) => {
        const btn = document.getElementById(btnId);
        const menu = document.getElementById(menuId);
        if (!btn || !menu) return;

        btn.onclick = (e) => {
            e.stopPropagation();
            // Close other dropdown if open
            if (btnId === 'auth-dropdown-btn' && !document.getElementById('pin-dropdown-menu').classList.contains('hidden')) {
                document.getElementById('pin-dropdown-menu').classList.add('hidden');
            } else if (btnId === 'pin-dropdown-btn' && !document.getElementById('auth-dropdown-menu').classList.contains('hidden')) {
                document.getElementById('auth-dropdown-menu').classList.add('hidden');
            }
            menu.classList.toggle('hidden');
        };
        
        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && !btn.contains(e.target)) {
                menu.classList.add('hidden');
            }
        });
    };

    toggleDropdown('auth-dropdown-btn', 'auth-dropdown-menu');
    toggleDropdown('pin-dropdown-btn', 'pin-dropdown-menu');


    // 2. Pin Toggle Listeners
    document.querySelectorAll('.pin-toggle').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent closing dropdown immediately
            const title = e.currentTarget.getAttribute('data-title');
            togglePinPage(title);
        });
    });

    // 3. Logout Listener
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                // The onAuthStateChanged listener handles the redirect after sign out
            } catch (error) {
                console.error("Logout Failed:", error);
            }
        });
    }

    // 4. Scroll and Fade Logic
    const fadeLeft = document.getElementById('fade-left');
    const fadeRight = document.getElementById('fade-right');

    const updateFades = () => {
        if (!tabMenuScroller) return;
        const { scrollLeft, scrollWidth, clientWidth } = tabMenuScroller;
        
        // Show left fade if scrolled more than a few pixels
        fadeLeft.style.opacity = scrollLeft > 10 ? '1' : '0';
        
        // Show right fade if scrollable content exceeds visible area AND we haven't hit the end
        const isScrollable = scrollWidth > clientWidth;
        const isAtEnd = Math.ceil(scrollLeft) >= (scrollWidth - clientWidth - 10); // -10 for slight tolerance
        fadeRight.style.opacity = isScrollable && !isAtEnd ? '1' : '0';
    };

    if (tabMenuScroller) {
        tabMenuScroller.addEventListener('scroll', () => {
             // Use requestAnimationFrame to defer state update for better performance
            if (!isScrollingProgrammatically) {
                requestAnimationFrame(updateFades);
            }
        });
        
        // Initialize fades
        // Must be run *after* content has rendered and layout is finalized (next frame)
        requestAnimationFrame(() => {
            updateFades(); 

            // 5. Initial Active Tab Scroll (Only on First Render)
            if (isFirstRender && activePage) {
                activeTabElement = document.querySelector(`.nav-tab.active`);
                if (activeTabElement) {
                    const menuWidth = tabMenuScroller.clientWidth;
                    const tabCenter = activeTabElement.offsetLeft + (activeTabElement.offsetWidth / 2);
                    const scrollPosition = tabCenter - (menuWidth / 2);
                    
                    isScrollingProgrammatically = true;
                    tabMenuScroller.scrollTo({
                        left: scrollPosition,
                        behavior: 'smooth'
                    });
                    
                    // Reset flag after a delay to allow the scroll animation to finish
                    setTimeout(() => {
                        isScrollingProgrammatically = false;
                        updateFades(); // Ensure fades are correct after scroll
                    }, 500); 
                }
            }
            isFirstRender = false;
        });
    }
};


// --- Initialization Function ---

const run = () => {
    // 1. Initialize Firebase App and Services
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
    } catch (error) {
        console.error("Firebase initialization failed:", error);
        // Fallback: Continue without Firebase services if initialization fails
        isAuthReady = true;
        loadPagesAndRender(null);
        return;
    }

    // 2. Set up Auth State Listener
    onAuthStateChanged(auth, (user) => {
        loadPagesAndRender(user); // Re-render and load pages on auth state change

        // --- AUTH REDIRECT LOGIC ---
        if (!user) {
            const targetUrl = '../index.html'; 
            const currentPathname = window.location.pathname.toLowerCase();
            const currentFileName = currentPathname.split('/').pop();
            
            // --- Conditions where a redirect is BLOCKED (Safe Pages) ---
            // Only the Auth Page, 404 page, and the root index.html are safe to stay on.
            // Note: We use includes() for authentication.html as it may have query params.
            const isExemptFromRedirect = 
                currentPathname.includes('authentication.html') || 
                currentPathname.includes('404.html') ||
                // Checks for the ROOT index.html file. It must end with '/index.html' AND NOT contain '/games/' in the path.
                (currentPathname.endsWith('/index.html') && !currentPathname.includes('/games/')); 

            if (isExemptFromRedirect) {
                return; // Do not redirect if on a safe page
            }

            // --- Conditions where a REDIRECT is ENFORCED (Protected/Unsafe Pages) ---
            
            // 1. Is it a generic protected page (e.g., settings.html, admin.html)?
            //    A page is protected if its filename is not index.html, authentication.html, or 404.html.
            const isProtectedPage = !['index.html', 'authentication.html', '404.html', ''].includes(currentFileName);
            
            // 2. Is it the specific sub-repo index the user wants to redirect from?
            const isGamesIndexToRedirect = currentPathname.includes('/games/') && currentFileName === 'index.html';

            if (isProtectedPage || isGamesIndexToRedirect) {
                console.log(`User logged out. Restricting access and redirecting to ${targetUrl}`);
                // Use replace to prevent the user from being able to navigate back to the secure page
                window.location.replace(targetUrl); 
            }
        }
    });

    // --- FINAL SETUP ---\n
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
