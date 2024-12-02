// Import the necessary Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signOut,
    createUserWithEmailAndPassword,
    fetchSignInMethodsForEmail,
    setPersistence,
    browserLocalPersistence,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase configuration (use your existing config)
const firebaseConfig = {
  apiKey: "AIzaSyAUIljfabkgsGO8FkLTfSNMpd7NeZW0a_M",
  authDomain: "treestride-project.firebaseapp.com",
  projectId: "treestride-project",
  storageBucket: "treestride-project.appspot.com",
  messagingSenderId: "218404996569",
  appId: "1:218404996569:web:d1daa406334c19cde5c5c8",
  measurementId: "G-XR01C3LFWD",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const PAGE_PERMISSIONS = {
  'dashboard.html': ['admin', 'sub-admin', 'forester'],
  'manage_mission.html': ['admin', 'sub-admin'],
  'announcements.html': ['admin', 'sub-admin'],
  'planting_requests.html': ['admin', 'sub-admin'],
  'tree_inventory.html': ['admin', 'sub-admin', 'forester'],
  'manage_trees.html': ['admin', 'sub-admin', 'forester'],
  'stock_management.html': ['admin', 'sub-admin', 'forester'],
  'reported_posts.html': ['admin', 'sub-admin'],
  'users.html': ['admin'], // Only admin can access
  'staffs.html': ['admin']
};

// Add loading state management
function showLoading() {
  document.getElementById('loadingOverlay-2').style.display = 'flex';
  document.querySelector('.navigation').classList.add('hidden');
  document.getElementById('sign-out').disabled = true;
}

function hideLoading() {
  document.getElementById('loadingOverlay-2').style.display = 'none';
  document.querySelector('.navigation').classList.remove('hidden');
  document.getElementById('sign-out').disabled = false;
}

// After initializing Firebase, set persistence
await setPersistence(auth, browserLocalPersistence);

// Modify the onAuthStateChanged listener to be less strict
let isCreatingAccount = false;
let isAdminReauthenticating = false;

onAuthStateChanged(auth, async (user) => {
  if (!isCreatingAccount && !isAdminReauthenticating) {
    showLoading();
  }
  
  // Don't perform redirects if we're in the middle of account creation
  if (isCreatingAccount || isAdminReauthenticating) {
    return;
  }

  if (user) {
    const email = user.email;
    const userRoleDisplay = document.getElementById('user-role-display');
    
    // Allow admin full access
    if (email === "admin@gmail.com") {
      userRoleDisplay.textContent = "Admin";
      hideLoading();
      fetchStaffAccounts();
      return;
    }

    try {
      // Get user role from Firestore
      const staffDoc = await getDoc(doc(db, "staffs", user.uid));
      if (!staffDoc.exists()) {
        throw new Error("Staff document not found");
      }

      const userRole = staffDoc.data().role;
      const currentPage = window.location.pathname.split('/').pop();
      const userData = staffDoc.data();
      userRoleDisplay.textContent = `${userData.username} (${userData.role})`;

      // Check page access
      const allowedRoles = PAGE_PERMISSIONS[currentPage] || [];
      if (!allowedRoles.includes(userRole)) {
        if (userRole === 'forester') {
          window.location.href = 'dashboard.html';
        } else {
          window.location.href = 'dashboard.html';
        }
        return;
      }

      // Update navigation visibility
      const navigation = document.querySelector('.navigation');
      const links = navigation.getElementsByTagName('a');
      
      for (let link of links) {
        const href = link.getAttribute('href');
        const linkAllowedRoles = PAGE_PERMISSIONS[href] || [];
        
        if (!linkAllowedRoles.includes(userRole)) {
          link.style.display = 'none';
        }
      }

      if (currentPage === 'staffs.html') {
        fetchStaffAccounts();
      }

      hideLoading();

    } catch (error) {
      console.error("Error checking permissions:", error);
      if (!isCreatingAccount && !isAdminReauthenticating) {
        window.location.href = "../index.html";
      }
    }
  } else {
    // Only redirect if we're not in the middle of account creation or admin reauth
    if (!isCreatingAccount && !isAdminReauthenticating) {
      window.location.href = "../index.html";
    }
  }
});

// Variables for pagination
let currentPage = 1;
const accountsPerPage = 5;
let totalAccounts = 0;
let staffAccounts = [];

// Create new account
document.getElementById("create-account-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const username = document.getElementById("username").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const phone = document.getElementById("phone").value;
  const role = document.getElementById("role").value;

  // Validate password format
  if (!validatePassword(password)) {
    alert("Please ensure the password meets all requirements");
    return;
  }

  try {
    toggleLoading(true);

    // Store admin credentials
    const adminEmail = auth.currentUser.email;
    let adminPassword;
    
    try {
      adminPassword = await getAdminPassword();
    } catch (error) {
      console.log("Admin password entry cancelled");
      toggleLoading(false);
      return;
    }

    // Set flags before starting the process
    isCreatingAccount = true;
    
    // First check if the email exists
    const signInMethods = await fetchSignInMethodsForEmail(auth, email);
    if (signInMethods.length > 0) {
      throw new Error("This email is already registered");
    }

    // Check if email exists in staff collection
    const staffQuery = query(collection(db, "staffs"), where("email", "==", email));
    const staffSnapshot = await getDocs(staffQuery);
    
    if (!staffSnapshot.empty) {
      throw new Error("A staff account with this email already exists");
    }

    // Create authentication account
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // Create user document in Firestore
    await setDoc(doc(db, "staffs", uid), {
      username: username,
      email: email,
      phoneNumber: phone,
      role: role,
      status: "active",
      createdAt: new Date().toISOString(),
      createdBy: adminEmail
    });

    // Sign out the new account
    await signOut(auth);
    
    // Reauthorize admin
    isAdminReauthenticating = true;
    await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
    
    // Reset flags after successful creation
    isCreatingAccount = false;
    isAdminReauthenticating = false;

    alert("Account created successfully!");
    document.getElementById("create-account-form").reset();
    resetPasswordRequirements();
    fetchStaffAccounts();
  } catch (error) {
    console.error("Error creating account:", error);
    
    // Reset flags
    isCreatingAccount = false;
    isAdminReauthenticating = false;
    
    // If something fails, ensure admin is signed back in
    if (auth.currentUser?.email !== "admin@gmail.com") {
      try {
        await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
      } catch (signInError) {
        alert("Session expired. Please log in again.");
        window.location.href = "../index.html";
        return;
      }
    }
    
    // Handle specific error cases
    let errorMessage = "Error creating account: ";
    if (error.code === "auth/email-already-in-use") {
      errorMessage += "This email address is already registered. Please use a different email.";
    } else {
      errorMessage += error.message;
    }
    
    alert(errorMessage);
  } finally {
    toggleLoading(false);
  }
});

// Add form reset handler to ensure password requirements are reset
document.getElementById("create-account-form").addEventListener("reset", () => {
  resetPasswordRequirements();
});

// Fetch staff accounts
async function fetchStaffAccounts() {
  try {
    const querySnapshot = await getDocs(collection(db, "staffs"));
    staffAccounts = querySnapshot.docs.map((doc) => ({
      uid: doc.id,
      ...doc.data()
    }));
    totalAccounts = staffAccounts.length;

    // Update display
    const emptyState = document.getElementById("empty-state");
    const staffTable = document.getElementById("staff-table");
    const paginationControls = document.getElementById("pagination-controls");

    if (totalAccounts === 0) {
      emptyState.style.display = "block";
      staffTable.style.display = "none";
      paginationControls.style.display = "none";
    } else {
      emptyState.style.display = "none";
      staffTable.style.display = "table";
      paginationControls.style.display = "flex";
      displayAccounts(currentPage);
      updatePaginationControls();
    }
  } catch (error) {
    console.error("Error fetching staff accounts:", error);
    alert("Error loading staff accounts");
  }
}

// Display accounts for current page
function displayAccounts(page) {
  const startIndex = (page - 1) * accountsPerPage;
  const endIndex = startIndex + accountsPerPage;
  const accountsToDisplay = staffAccounts.slice(startIndex, endIndex);

  const staffList = document.getElementById("staff-list");
  staffList.innerHTML = "";

  accountsToDisplay.forEach((account) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${account.username}</td>
      <td>${account.email}</td>
      <td>${account.role}</td>
      <td><span class="status-badge ${account.status}">${account.status}</span></td>
      <td class="actions">
        <button class="action-button edit-button" data-uid="${account.uid}">Edit</button>
      </td>
    `;
    staffList.appendChild(row);
  });

  // Add event listeners for edit buttons
  const editButtons = document.querySelectorAll(".edit-button");
  editButtons.forEach((button) => {
    button.addEventListener("click", async (event) => {
      const uid = event.target.getAttribute("data-uid");
      await showEditForm(uid);
    });
  });
}

// Show edit form
async function showEditForm(uid) {
  try {
    const staffRef = doc(db, "staffs", uid);
    const staffSnap = await getDoc(staffRef);

    if (staffSnap.exists()) {
      const staffData = staffSnap.data();

      // Populate the edit form
      document.getElementById("edit-uid").value = uid;
      document.getElementById("edit-username").value = staffData.username;
      document.getElementById("edit-email").value = staffData.email;
      document.getElementById("edit-phone").value = staffData.phoneNumber || "";
      document.getElementById("edit-role").value = staffData.role;
      document.getElementById("edit-status").value = staffData.status;

      // Show the edit modal
      document.getElementById("edit-modal").style.display = "grid";
    }
  } catch (error) {
    console.error("Error fetching staff account:", error);
    alert("Error loading account data");
  }
}

// Handle edit form submission
document.getElementById("edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const uid = document.getElementById("edit-uid").value;
  const updatedData = {
    username: document.getElementById("edit-username").value,
    email: document.getElementById("edit-email").value,
    phoneNumber: document.getElementById("edit-phone").value,
    role: document.getElementById("edit-role").value,
    status: document.getElementById("edit-status").value,
    updatedAt: new Date().toISOString(),
    updatedBy: auth.currentUser.email
  };

  try {
    const staffRef = doc(db, "staffs", uid);
    await updateDoc(staffRef, updatedData);
    alert("Account updated successfully");
    document.getElementById("edit-modal").style.display = "none";
    await fetchStaffAccounts();
  } catch (error) {
    console.error("Error updating account:", error);
    alert("Error updating account");
  }
});

// Pagination controls
function updatePaginationControls() {
  const totalPages = Math.ceil(totalAccounts / accountsPerPage);
  document.getElementById("page-info").innerText = `Page ${currentPage} of ${totalPages}`;
  document.getElementById("prev-page").disabled = currentPage === 1;
  document.getElementById("next-page").disabled = currentPage === totalPages;
}

document.getElementById("prev-page").addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    displayAccounts(currentPage);
    updatePaginationControls();
  }
});

document.getElementById("next-page").addEventListener("click", () => {
  const totalPages = Math.ceil(totalAccounts / accountsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    displayAccounts(currentPage);
    updatePaginationControls();
  }
});

// Modal close handlers
document.querySelectorAll(".close").forEach(closeBtn => {
  closeBtn.addEventListener("click", () => {
    document.getElementById("edit-modal").style.display = "none";
  });
});

window.onclick = (event) => {
    const editModal = document.getElementById("edit-modal");
    if (event.target == editModal) {
      editModal.style.display = "none";
    }
  };
  
  // Sign out functionality
  const signOutButton = document.getElementById("sign-out");
  signOutButton.addEventListener("click", () => {
    signOut(auth)
      .then(() => {
        window.location.href = "../index.html";
      })
      .catch((error) => {
        console.error("Error signing out:", error);
      });
  });
  
  // Add form validation
  function validatePassword(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_,.?":{}|<>]/.test(password);
    
    // Update requirement indicators
    document.getElementById('length-check').className = 
      password.length >= minLength ? 'requirement-met' : 'requirement-not-met';
    document.getElementById('uppercase-check').className = 
      hasUpperCase ? 'requirement-met' : 'requirement-not-met';
    document.getElementById('number-check').className = 
      hasNumber ? 'requirement-met' : 'requirement-not-met';
    document.getElementById('special-check').className = 
      hasSpecialChar ? 'requirement-met' : 'requirement-not-met';
  
    return password.length >= minLength && hasUpperCase && hasNumber && hasSpecialChar;
  }
  
  // Show/hide password functionality
  document.querySelector('.toggle-password').addEventListener('click', function() {
    const passwordInput = document.getElementById('password');
    const icon = this.querySelector('i');
    
    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    } else {
      passwordInput.type = 'password';
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    }
  });
  
  // Password input validation
  document.getElementById('password').addEventListener('input', function(e) {
    const password = e.target.value;
    const isValid = validatePassword(password);
    
    if (!isValid && password.length > 0) {
      e.target.setCustomValidity("Please meet all password requirements");
    } else {
      e.target.setCustomValidity("");
    }
  });
 
  // Add email validation
  document.getElementById("email").addEventListener("input", function(e) {
    const email = e.target.value;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(email) && email.length > 0) {
      e.target.setCustomValidity("Please enter a valid email address");
    } else {
      e.target.setCustomValidity("");
    }
  });
  
  // Add phone number validation
  document.getElementById("phone").addEventListener("input", function(e) {
    const phone = e.target.value;
    const phoneRegex = /^[\d\s\-\+()]{10,}$/; // Basic phone format validation
    
    if (!phoneRegex.test(phone) && phone.length > 0) {
      e.target.setCustomValidity("Please enter a valid phone number");
    } else {
      e.target.setCustomValidity("");
    }
  });
  
  // Add status change confirmation
  document.getElementById("edit-status").addEventListener("change", function(e) {
    if (e.target.value === "inactive") {
      if (!confirm("Are you sure you want to deactivate this account? The user will no longer be able to access the system.")) {
        e.target.value = "active";
      }
    }
  });
  
  // Store previous value when focusing on role select
  document.getElementById("edit-role").addEventListener("focus", function(e) {
    e.target.dataset.previousValue = e.target.value;
  });
  
  // Admin confirmation
  async function getAdminPassword() {
    return new Promise((resolve, reject) => {
      const dialog = document.createElement('div');
      dialog.className = 'admin-password-dialog';
      dialog.innerHTML = `
        <h3>Admin Authentication Required</h3>
        <p>Please enter your admin password to continue</p>
        <div class="password-input-container">
          <input type="password" id="admin-password" />
          <button type="button" class="toggle-password" aria-label="Toggle password visibility">
            <i class="fas fa-eye"></i>
          </button>
        </div>
        <div class="dialog-buttons">
          <button type="button" class="cancel-button">Cancel</button>
          <button type="button" class="confirm-button">Confirm</button>
        </div>
      `;
      
      document.body.appendChild(dialog);
      
      const adminInput = dialog.querySelector('#admin-password');
      const toggleBtn = dialog.querySelector('.toggle-password');
      const cancelBtn = dialog.querySelector('.cancel-button');
      const confirmBtn = dialog.querySelector('.confirm-button');
      
      toggleBtn.addEventListener('click', function() {
        const icon = this.querySelector('i');
        if (adminInput.type === 'password') {
          adminInput.type = 'text';
          icon.classList.remove('fa-eye');
          icon.classList.add('fa-eye-slash');
        } else {
          adminInput.type = 'password';
          icon.classList.remove('fa-eye-slash');
          icon.classList.add('fa-eye');
        }
      });
      
      cancelBtn.addEventListener('click', () => {
        document.body.removeChild(dialog);
        reject(new Error('Cancelled by user'));
      });
      
      confirmBtn.addEventListener('click', () => {
        const password = adminInput.value;
        document.body.removeChild(dialog);
        resolve(password);
      });
      
      adminInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
          const password = adminInput.value;
          document.body.removeChild(dialog);
          resolve(password);
        }
      });
    });
  }

  // Add loading overlay to your HTML
const loadingOverlay = document.createElement('div');
loadingOverlay.className = 'loading-overlay';
loadingOverlay.innerHTML = `
  <div class="loading-spinner">
    <div class="spinner"></div>
    <p>Creating account...</p>
  </div>
`;
document.body.appendChild(loadingOverlay);

// Function to reset password requirements
function resetPasswordRequirements() {
  const requirements = [
    'length-check',
    'uppercase-check',
    'number-check',
    'special-check'
  ];
  
  requirements.forEach(req => {
    const element = document.getElementById(req);
    if (element) {
      element.className = 'password-requirements';
    }
  });
}

// Function to show/hide loading overlay
function toggleLoading(show) {
  const overlay = document.querySelector('.loading-overlay');
  if (overlay) {
    overlay.style.display = show ? 'flex' : 'none';
  }
}
  
  // Initialize the page
  document.addEventListener("DOMContentLoaded", () => {
    fetchStaffAccounts();
  });