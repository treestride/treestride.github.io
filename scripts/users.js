// Import the necessary Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase configuration
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
  'goal_cms.html': ['admin', 'sub-admin'],
  'reported_posts.html': ['admin', 'sub-admin'],
  'users.html': ['admin'], 
  'staffs.html': ['admin']
};

// Add loading state management
function showLoading() {
  document.getElementById('loadingOverlay').style.display = 'flex';
  document.querySelector('.navigation').classList.add('hidden');
  document.getElementById('sign-out').disabled = true;
}

function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
  document.querySelector('.navigation').classList.remove('hidden');
  document.getElementById('sign-out').disabled = false;
}

// Check authentication state
onAuthStateChanged(auth, async (user) => {
  showLoading();
  if (user) {
    const email = user.email;
    const userRoleDisplay = document.getElementById('user-role-display');
    
    // Allow admin full access
    if (email === "admin@gmail.com") {
      userRoleDisplay.textContent = "Admin";
      hideLoading();
      fetchUsers();
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
          // Redirect foresters to tree inventory
          window.location.href = 'dashboard.html';
        } else {
          // Redirect sub-admins to dashboard
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

      // Continue with regular page initialization
      if (currentPage === 'users.html') {
        fetchUsers();
      }

      hideLoading();

    } catch (error) {
      console.error("Error checking permissions:", error);
      window.location.href = "../index.html";
    }
  } else {
      window.location.href = "../index.html";
  }
});

// Variables for pagination
let currentPage = 1;
const usersPerPage = 4;
let totalUsers = 0;
let users = [];

async function fetchUsers() {
  const querySnapshot = await getDocs(collection(db, "users"));
  users = querySnapshot.docs.map((doc) => {
    return { uid: doc.id, ...doc.data() };
  });
  totalUsers = users.length;

  // Update the total users count display
  document.getElementById("total-users-count").textContent = totalUsers;

  // Show/hide empty state and table based on users array
  const emptyState = document.getElementById("empty-state");
  const userTable = document.getElementById("user-table");
  const paginationControls = document.getElementById(
    "pagination-controls"
  );

  if (totalUsers === 0) {
    emptyState.style.display = "block";
    userTable.style.display = "none";
    paginationControls.style.display = "none";
  } else {
    emptyState.style.display = "none";
    userTable.style.display = "table";
    paginationControls.style.display = "flex";
    displayUsers(currentPage);
    updatePaginationControls();
  }
}

function displayUsers(page) {
  const startIndex = (page - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;
  const usersToDisplay = users.slice(startIndex, endIndex);

  const userList = document.getElementById("user-list");
  userList.innerHTML = "";

  usersToDisplay.forEach((userData, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><img src="${userData.photoURL}" alt="${userData.username}'s photo" /></td>
      <td>${userData.username}</td>
      <td>${userData.totalPoints}</td>
      <td>${userData.totalSteps}</td>
      <td>${userData.totalTrees}</td>
      <td>${userData.missionsCompleted}</td>
      <td class="actions">
        <button class="action-button view-button" data-uid="${userData.uid}">View</button>
        <button class="action-button edit-button" data-uid="${userData.uid}">Edit</button>
      </td>
    `;
    userList.appendChild(row);
  });

  // Add event listeners for edit buttons
  const editButtons = document.querySelectorAll(".edit-button");
  editButtons.forEach((button) => {
    button.addEventListener("click", async (event) => {
      const uid = event.target.getAttribute("data-uid");
      await showEditForm(uid);
    });
  });

  // Attach event listeners to the view buttons
  const viewButtons = document.querySelectorAll(".view-button");
  viewButtons.forEach((button) => {
    button.addEventListener("click", async (event) => {
      const uid = event.target.getAttribute("data-uid");
      await showUserDetails(uid);
    });
  });

  // Attach event listeners to the delete buttons
  const deleteButtons = document.querySelectorAll(".delete-button");
  deleteButtons.forEach((button) => {
    button.addEventListener("click", async (event) => {
      const uid = event.target.getAttribute("data-uid");
      const index = event.target.getAttribute("data-index");
      await deleteUser(uid, index);
    });
  });
}

// Add these new functions for editing
async function showEditForm(uid) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();

      // Populate the edit form
      document.getElementById("edit-uid").value = uid;
      document.getElementById("edit-username").value = userData.username;
      document.getElementById("edit-email").value = userData.email;
      document.getElementById("edit-phone").value =
        userData.phoneNumber || "";
      document.getElementById("edit-points").value = userData.totalPoints;
      document.getElementById("edit-steps").value = userData.totalSteps;
      document.getElementById("edit-trees").value = userData.totalTrees;
      document.getElementById("edit-missions").value =
        userData.missionsCompleted;

      // Show the edit modal
      document.getElementById("edit-modal").style.display = "grid";
    }
  } catch (error) {
    console.error("Error fetching user for edit: ", error);
    alert("Error loading user data");
  }
}

// Add form submission handler
document
  .getElementById("edit-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const uid = document.getElementById("edit-uid").value;
    const updatedData = {
      username: document.getElementById("edit-username").value,
      email: document.getElementById("edit-email").value,
      phoneNumber: document.getElementById("edit-phone").value,
      totalPoints: parseInt(document.getElementById("edit-points").value),
      totalSteps: parseInt(document.getElementById("edit-steps").value),
      totalTrees: parseInt(document.getElementById("edit-trees").value),
      missionsCompleted: parseInt(
        document.getElementById("edit-missions").value
      ),
    };

    try {
      const userRef = doc(db, "users", uid);
      await updateDoc(userRef, updatedData);
      alert("User updated successfully");
      document.getElementById("edit-modal").style.display = "none";

      // Refresh the user list
      await fetchUsers();
    } catch (error) {
      console.error("Error updating user: ", error);
      alert("Error updating user");
    }
  });

// Function to display user details in the modal
async function showUserDetails(uid) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();

      // Populate modal with user data
      document.getElementById("modal-profile").src = userData.photoURL;
      document.getElementById("modal-username").innerText =
        userData.username;
      document.getElementById("modal-email").innerText = userData.email;
      document.getElementById("modal-phone").innerText =
        userData.phoneNumber;
      document.getElementById("modal-qr").src = userData.userQrCode || "";
      document.getElementById("qr-link").href = userData.userQrCode || "";

      // Show the modal
      document.getElementById("user-modal").style.display = "grid";
    } else {
      alert("User not found");
    }
  } catch (error) {
    console.error("Error fetching user: ", error);
  }
}

// Ensure each view button correctly triggers 'showUserDetails'
const viewButtons = document.querySelectorAll(".view-button");

viewButtons.forEach((button) => {
  button.addEventListener("click", async (event) => {
    const uid = event.target.getAttribute("data-uid");
    await showUserDetails(uid);
  });
});

// Close the modal when the "X" button is clicked
document.querySelector(".close").addEventListener("click", () => {
  document.getElementById("user-modal").style.display = "none";
});

// Close the modal when clicking outside the modal content
window.onclick = (event) => {
  const userModal = document.getElementById("user-modal");
  const editModal = document.getElementById("edit-modal");
  if (event.target == userModal) {
    userModal.style.display = "none";
  } else if (event.target == editModal) {
    editModal.style.display = "none";
  }
};

// Update the pagination controls
function updatePaginationControls() {
  const totalPages = Math.ceil(totalUsers / usersPerPage);

  document.getElementById(
    "page-info"
  ).innerText = `Page ${currentPage} of ${totalPages}`;

  document.getElementById("prev-page").disabled = currentPage === 1;
  document.getElementById("next-page").disabled =
    currentPage === totalPages;
}

// Pagination button listeners
document.getElementById("prev-page").addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    displayUsers(currentPage);
    updatePaginationControls();
  }
});

document.getElementById("next-page").addEventListener("click", () => {
  const totalPages = Math.ceil(totalUsers / usersPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    displayUsers(currentPage);
    updatePaginationControls();
  }
});

// Sign out function
const signOutButton = document.getElementById("sign-out");
signOutButton.addEventListener("click", () => {
  signOut(auth)
    .then(() => {
      window.location.href = "../index.html";
    })
    .catch((error) => {
      console.error("Error signing out: ", error);
    });
});