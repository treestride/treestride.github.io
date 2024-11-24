import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAUIljfabkgsGO8FkLTfSNMpd7NeZW0a_M",
  authDomain: "treestride-project.firebaseapp.com",
  projectId: "treestride-project",
  storageBucket: "treestride-project.appspot.com",
  messagingSenderId: "218404996569",
  appId: "1:218404996569:web:d1daa406334c19cde5c5c8",
  measurementId: "G-XR01C3LFWD",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

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

// Check authentication state
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const email = user.email;
    const userRoleDisplay = document.getElementById('user-role-display');
    
    // Allow admin full access
    if (email === "admin@gmail.com") {
      userRoleDisplay.textContent = "Admin";
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
    } catch (error) {
      console.error("Error checking permissions:", error);
      window.location.href = "../index.html";
    }
  } else {
      window.location.href = "../index.html";
  }
});

// Sign out functionality
document.getElementById("sign-out").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

// Pagination state
let currentPage = 1;
const itemsPerPage = 10;
let stockEntries = [];

// Load trees into select dropdown
async function loadTrees() {
  const treeSelect = document.getElementById("treeSelect");
  const querySnapshot = await getDocs(collection(db, "tree_inventory"));

  treeSelect.innerHTML = '<option value="">Select a tree</option>';
  querySnapshot.forEach((doc) => {
    const tree = doc.data();
    const option = document.createElement("option");
    option.value = doc.id;
    option.textContent = tree.name;
    treeSelect.appendChild(option);
  });

  // Listen for tree selection to display current stock
  treeSelect.addEventListener("change", updateCurrentStockDisplay);
}

// Fetch and display the selected tree's current stock
// Show or hide stock fields based on tree selection
async function updateCurrentStockDisplay() {
  const treeId = document.getElementById("treeSelect").value;
  const currentStockDisplay = document.getElementById("currentStock");
  const stockFields = document.getElementById("stockFields");

  if (treeId) {
    // Fetch the current stock for the selected tree
    const treeDoc = await getDoc(doc(db, "tree_inventory", treeId));
    const currentStock = treeDoc.exists()
      ? treeDoc.data().stocks || 0
      : 0;
    currentStockDisplay.value = currentStock;
    stockFields.style.display = "block"; // Show stock fields
  } else {
    currentStockDisplay.value = "";
    stockFields.style.display = "none"; // Hide stock fields
  }
}

// Handle form submission
document
  .getElementById("stockForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const treeId = document.getElementById("treeSelect").value;
    const quantity = parseInt(
      document.getElementById("stockQuantity").value
    );
    const notes = document.getElementById("notes").value;
    const operation = document.getElementById("operation").value;
    const currentStock = parseInt(
      document.getElementById("currentStock").value
    );

    try {
      // Calculate new stock level based on operation
      const newStock =
        operation === "delivered"
          ? currentStock + quantity
          : currentStock - quantity; // requested case

      if (newStock < 0) {
        alert("Not enough stock to provide the specified quantity.");
        return;
      }

      // Add stock entry
      await addDoc(collection(db, "stock_entries"), {
        treeId,
        quantity: operation === "delivered" ? quantity : quantity,
        operation,
        notes,
        timestamp: serverTimestamp(),
      });

      // Update total stock in tree_inventory
      const treeRef = doc(db, "tree_inventory", treeId);
      await updateDoc(treeRef, {
        stocks: newStock,
        lastUpdated: serverTimestamp(),
      });

      alert(`Stock added successfully!`);
      document.getElementById("stockForm").reset();
      loadStockHistory();
      updateCurrentStockDisplay();
    } catch (error) {
      console.error("Error updating stock:", error);
      alert("Error updating stock!");
    }
  });

async function loadStockHistory() {
  const querySnapshot = await getDocs(
    query(collection(db, "stock_entries"), orderBy("timestamp", "desc"))
  );

  stockEntries = await Promise.all(
    querySnapshot.docs.map(async (stockDoc) => {
      const entry = stockDoc.data();
      const treeDocRef = doc(db, "tree_inventory", entry.treeId);
      const treeDoc = await getDoc(treeDocRef);
      const treeName = treeDoc.data()?.name || "Unknown Tree";
      const treeImage = treeDoc.data()?.image || "placeholder.jpg";

      return {
        image: treeImage,
        treeName: treeName,
        operation:
          entry.operation ||
          (entry.quantity > 0 ? "delivered" : "requested"),
        quantity: Math.abs(entry.quantity),
        notes: entry.notes || "",
        timestamp: entry.timestamp
          ? new Date(entry.timestamp.toDate()).toLocaleString()
          : "N/A",
      };
    })
  );

  updatePagination();
  displayCurrentPage();
}

function updatePagination() {
  const totalPages = Math.ceil(stockEntries.length / itemsPerPage);
  const paginationControls =
    document.getElementById("paginationControls");
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(
    startIndex + itemsPerPage,
    stockEntries.length
  );

  // Update info text
  document.getElementById("startIndex").textContent = stockEntries.length
    ? startIndex + 1
    : 0;
  document.getElementById("endIndex").textContent = endIndex;
  document.getElementById("totalEntries").textContent =
    stockEntries.length;

  // Clear existing pagination controls
  paginationControls.innerHTML = "";

  // First page button
  const firstButton = createPaginationButton("<<", 1);
  firstButton.disabled = currentPage === 1;
  paginationControls.appendChild(firstButton);

  // Previous button
  const prevButton = createPaginationButton("<", currentPage - 1);
  prevButton.disabled = currentPage === 1;
  paginationControls.appendChild(prevButton);

  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    const pageButton = createPaginationButton(i.toString(), i);
    if (i === currentPage) {
      pageButton.classList.add("active");
    }
    paginationControls.appendChild(pageButton);
  }

  // Next button
  const nextButton = createPaginationButton(">", currentPage + 1);
  nextButton.disabled = currentPage === totalPages;
  paginationControls.appendChild(nextButton);

  // Last page button
  const lastButton = createPaginationButton(">>", totalPages);
  lastButton.disabled = currentPage === totalPages;
  paginationControls.appendChild(lastButton);
}

function createPaginationButton(text, pageNumber) {
  const button = document.createElement("button");
  button.className = "pagination-button";
  button.textContent = text;
  button.addEventListener("click", () => {
    if (pageNumber !== currentPage) {
      currentPage = pageNumber;
      updatePagination();
      displayCurrentPage();
    }
  });
  return button;
}

function displayCurrentPage() {
  const stockHistory = document.getElementById("stockHistory");
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(
    startIndex + itemsPerPage,
    stockEntries.length
  );
  const currentItems = stockEntries.slice(startIndex, endIndex);

  stockHistory.innerHTML = "";

  currentItems.forEach((entry) => {
    const row = document.createElement("tr");
    row.innerHTML = `
    <td><img src="${entry.image}" alt="${entry.treeName}" /></td>
    <td>${entry.treeName}</td>
    <td>
      <span class="operation-badge ${entry.operation.toLowerCase()}">
        ${entry.operation}
      </span>
    </td>
    <td>${entry.quantity}</td>
    <td>${entry.notes || "-"}</td>
    <td>${entry.timestamp}</td>
  `;
    stockHistory.appendChild(row);
  });
}

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

// Initial load
loadTrees();
loadStockHistory();