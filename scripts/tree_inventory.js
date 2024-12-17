import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  getDocs,
  doc,
  getDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  startAfter,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
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
const storage = getStorage(app);
const treesCollectionRef = collection(db, "tree_inventory");
const stockEntriesCollectionRef = collection(db, "stock_entries");

const PAGE_PERMISSIONS = {
  "dashboard.html": ["admin", "sub-admin", "forester"],
  "manage_mission.html": ["admin", "sub-admin"],
  "group_mission.html": ["admin", "sub-admin"],
  "announcements.html": ["admin", "sub-admin"],
  "planting_requests.html": ["admin", "sub-admin"],
  "tree_inventory.html": ["admin", "sub-admin", "forester"],
  "manage_trees.html": ["admin", "sub-admin", "forester"],
  "goal_cms.html": ["admin", "sub-admin"],
  "reported_posts.html": ["admin", "sub-admin"],
  "users.html": ["admin"],
  "staffs.html": ["admin"],
};

// Pagination constants for stock entries
const STOCK_ENTRIES_PER_PAGE = 5;
let currentStockEntriesPage = 1;
let lastStockEntrySnapshot = null;
let totalStockEntries = 0;

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
      hideLoading();
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
    window.location.href = "../index.html";
  });
});

// Modal functionality
const modal = document.getElementById("treeModal");
const addTreeBtn = document.getElementById("addTree");
const closeBtn = document.getElementsByClassName("close")[0];

addTreeBtn.onclick = () => (modal.style.display = "flex");

closeBtn.onclick = () => {
  modal.style.display = "none";
  clearForm();
};

window.onclick = (event) => {
  if (event.target == modal) {
    modal.style.display = "none";
    clearForm();
  }
};

function clearForm() {
  document.getElementById("treeForm").reset();
  document.getElementById("treeId").value = "";
}

const ITEMS_PER_PAGE = 3; // Number of items per page
let currentPage = 1;
let filteredTrees = []; // Store all filtered trees

async function loadTrees() {
  try {
    const [seedlingSnapshot] = await Promise.all([
      getDocs(treesCollectionRef),
    ]);

    // Get filter values
    const searchTerm = document
      .getElementById("searchInput")
      .value.toLowerCase();
    const typeFilter = document.getElementById("typeFilter").value;

    // Filter trees
    filteredTrees = [];
    seedlingSnapshot.forEach((doc) => {
      const tree = { id: doc.id, ...doc.data() };
      if (matchesFilters(tree, searchTerm, typeFilter)) {
        filteredTrees.push(tree);
      }
    });

    // Reset to first page when filters change
    currentPage = 1;
    
    // Render trees with pagination
    renderTrees();
    renderPagination();
  } catch (error) {
    console.error("Error loading trees:", error);
    alert("Error loading tree inventory!");
  }
}

// Log stock entry function
async function logStockEntry(treeId, operation, quantity) {
  try {
    // Get the tree name for logging
    const treeDoc = await getDoc(doc(db, "tree_inventory", treeId));
    const treeName = treeDoc.exists() ? treeDoc.data().name : "Unknown Tree";

    // Prepare stock entry data
    const stockEntryData = {
      treeId: treeId,
      treeName: treeName,
      operation: operation,
      quantity: quantity,
      timestamp: serverTimestamp(),
      notes: `Stock ${operation} for ${treeName}`
    };

    // Add to stock_entries collection
    await addDoc(stockEntriesCollectionRef, stockEntryData);
  } catch (error) {
    console.error("Error logging stock entry:", error);
  }
}

// Load and display stock entries
async function loadStockEntries() {
  try {
    const stockEntriesBody = document.getElementById("stockEntriesBody");
    stockEntriesBody.innerHTML = ""; // Clear previous entries

    // Fetch total stock entries count
    if (currentStockEntriesPage === 1) {
      const totalSnapshot = await getDocs(stockEntriesCollectionRef);
      totalStockEntries = totalSnapshot.size;
    }

    // Query for the current page
    let q = query(
      stockEntriesCollectionRef,
      orderBy("timestamp", "desc"),
      limit(STOCK_ENTRIES_PER_PAGE)
    );

    // If not the first page, use `startAfter` for pagination
    if (currentStockEntriesPage > 1 && lastStockEntrySnapshot) {
      q = query(
        stockEntriesCollectionRef,
        orderBy("timestamp", "desc"),
        startAfter(lastStockEntrySnapshot),
        limit(STOCK_ENTRIES_PER_PAGE)
      );
    }

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      lastStockEntrySnapshot = snapshot.docs[snapshot.docs.length - 1];
    }

    // Render entries
    snapshot.forEach((doc) => {
      const entry = doc.data();
      const row = document.createElement("tr");
      const timestamp = entry.timestamp
        ? new Date(entry.timestamp.toDate()).toLocaleString()
        : "N/A";

      row.innerHTML = `
        <td>${entry.treeName}</td>
        <td>${entry.operation}</td>
        <td>${entry.quantity}</td>
        <td>${timestamp}</td>
        <td>${entry.notes || ""}</td>
      `;
      stockEntriesBody.appendChild(row);
    });

    // Render pagination controls
    renderStockEntriesPagination();
  } catch (error) {
    console.error("Error loading stock entries:", error);
    alert("Error loading stock entries!");
  }
}

// Render stock entries pagination
function renderStockEntriesPagination() {
  const stockEntriesPaginationContainer = document.getElementById(
    "stockEntriesPaginationContainer"
  );
  stockEntriesPaginationContainer.innerHTML = ""; // Clear previous pagination

  // Calculate total pages
  const totalPages = Math.ceil(totalStockEntries / STOCK_ENTRIES_PER_PAGE);

  // Page Info Display
  const pageInfo = document.createElement("div");
  pageInfo.textContent = `Page ${currentStockEntriesPage} of ${totalPages}`;
  pageInfo.classList.add("page-info");
  stockEntriesPaginationContainer.appendChild(pageInfo);

  // First button
  if (currentStockEntriesPage > 1) {
    const firstButton = createStockEntriesPaginationButton("« First", () => {
      currentStockEntriesPage = 1;
      lastStockEntrySnapshot = null;
      loadStockEntries();
    });
    stockEntriesPaginationContainer.appendChild(firstButton);
  }

  // Previous button
  if (currentStockEntriesPage > 1) {
    const prevButton = createStockEntriesPaginationButton("‹ Prev", () => {
      currentStockEntriesPage--;
      loadStockEntries();
    });
    stockEntriesPaginationContainer.appendChild(prevButton);
  }

  // Next button
  if (currentStockEntriesPage < totalPages) {
    const nextButton = createStockEntriesPaginationButton("Next ›", () => {
      currentStockEntriesPage++;
      loadStockEntries();
    });
    stockEntriesPaginationContainer.appendChild(nextButton);
  }

  // Last button
  if (currentStockEntriesPage < totalPages) {
    const lastButton = createStockEntriesPaginationButton("Last »", () => {
      currentStockEntriesPage = totalPages;
      loadStockEntries();
    });
    stockEntriesPaginationContainer.appendChild(lastButton);
  }
}

// Helper function to create pagination buttons
function createStockEntriesPaginationButton(text, onClick, isDisabled = false) {
  const button = document.createElement("button");
  button.textContent = text;
  if (isDisabled) {
    button.disabled = true;
    button.classList.add("disabled");
  }
  button.addEventListener("click", onClick);
  return button;
}


function renderTrees() {
  const treeItems = document.getElementById("treeItems");
  treeItems.innerHTML = "";

  // Calculate start and end indices for current page
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const pageTrees = filteredTrees.slice(startIndex, endIndex);

  pageTrees.forEach(tree => {
    appendTreeToTable(tree, treeItems, true);
  });
}

function renderPagination() {
  const paginationContainer = document.getElementById("paginationContainer");
  paginationContainer.innerHTML = ""; // Clear previous pagination

  const totalPages = Math.ceil(filteredTrees.length / ITEMS_PER_PAGE);

  // First button
  if (currentPage > 1) {
    const firstButton = createPaginationButton("« First", () => {
      currentPage = 1;
      renderTrees();
      renderPagination();
    });
    paginationContainer.appendChild(firstButton);
  }

  // Previous button
  if (currentPage > 1) {
    const prevButton = createPaginationButton("‹ Prev", () => {
      currentPage--;
      renderTrees();
      renderPagination();
    });
    paginationContainer.appendChild(prevButton);
  }

  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    const pageButton = createPaginationButton(i, () => {
      currentPage = i;
      renderTrees();
      renderPagination();
    }, i === currentPage);
    paginationContainer.appendChild(pageButton);
  }

  // Next button
  if (currentPage < totalPages) {
    const nextButton = createPaginationButton("Next ›", () => {
      currentPage++;
      renderTrees();
      renderPagination();
    });
    paginationContainer.appendChild(nextButton);
  }

  // Last button
  if (currentPage < totalPages) {
    const lastButton = createPaginationButton("Last »", () => {
      currentPage = totalPages;
      renderTrees();
      renderPagination();
    });
    paginationContainer.appendChild(lastButton);
  }
}

// Helper function to create pagination buttons
function createPaginationButton(text, onClick, isActive = false) {
  const button = document.createElement("button");
  button.textContent = text;
  if (isActive) button.classList.add("active");
  button.addEventListener("click", onClick);
  return button;
}


async function updateStatistics() {
  try {
    const [seedlingSnapshot] = await Promise.all([
      getDocs(treesCollectionRef),
    ]);

    let totalTrees = 0;
    let bearingTrees = 0;
    let nonBearingTrees = 0;

    // Count mature trees
    seedlingSnapshot.forEach((doc) => {
      const tree = doc.data();
      totalTrees++;
      if (tree.type === "bearing") bearingTrees++;
      else nonBearingTrees++;
    });

    // Update statistics display
    document.getElementById("totalTrees").textContent = totalTrees;
    document.getElementById("bearingTrees").textContent = bearingTrees;
    document.getElementById("nonBearingTrees").textContent =
      nonBearingTrees;
  } catch (error) {
    console.error("Error updating statistics:", error);
  }
}

function matchesFilters(tree, searchTerm, typeFilter) {
  return (
    (!searchTerm ||
      tree.name.toLowerCase().includes(searchTerm) ||
      tree.description.toLowerCase().includes(searchTerm)) &&
    (!typeFilter || tree.type === typeFilter)
  );
}

function appendTreeToTable(tree, container, isSeedling) {
  const row = document.createElement("tr");
  const lastUpdated = tree.lastUpdated
    ? new Date(tree.lastUpdated.toDate()).toLocaleDateString()
    : "Never";

  if (isSeedling) {
    row.innerHTML = `
      <td><img src="${tree.image || "/placeholder-tree.jpg"}" alt="${
      tree.name
    }"></td>
      <td>${tree.name}</td>
      <td>${tree.description}</td>
      <td>${tree.type === "bearing" ? "Bearing" : "Non-bearing"}</td>
      <td>${tree.stocks || 0}</td>
      <td>${lastUpdated}</td>
      <td class="actions">
          <button onclick="window.editTree('${tree.id}', true)">
              <i class="fas fa-edit"></i>
          </button>
      </td>
    `;
  }

  container.appendChild(row);
}

// Add/Update tree
async function saveTree(event) {
  event.preventDefault();

  const treeId = document.getElementById("treeId").value;

  try {
    let imageUrl = null;
    const imageFile = document.getElementById("treeImage").files[0];

    if (imageFile) {
      // Upload new image if provided
      const imageRef = ref(
        storage,
        `tree_images/${Date.now()}_${imageFile.name}`
      );
      await uploadBytes(imageRef, imageFile);
      imageUrl = await getDownloadURL(imageRef);
    }

    // Prepare tree data
    const treeData = {
      name: document.getElementById("name").value,
      description: document.getElementById("description").value,
      type: document.getElementById("type").value,
      lastUpdated: serverTimestamp(),
    };

    // Check if tree already exists (duplicate check)
    const existingTreesQuery = query(
      treesCollectionRef,
      where("name", "==", treeData.name),
      where("type", "==", treeData.type)
    );

    const querySnapshot = await getDocs(existingTreesQuery);

    if (!treeId && !querySnapshot.empty) {
      // Tree already exists, prevent adding it
      alert("A tree with the same name and type already exists.");
      return;
    }

    // Add or update tree
    if (treeId) {
      // Get existing tree data to preserve image if no new one is uploaded
      const seedlingDoc = await getDoc(doc(db, "tree_inventory", treeId));
      const existingData = seedlingDoc.exists() ? seedlingDoc.data() : null;

      // Use existing image if no new one was uploaded
      treeData.image =
        imageUrl || (existingData ? existingData.image : null);

      // Update the existing tree document
      await updateDoc(doc(db, "tree_inventory", treeId), treeData);
    } else {
      // For new trees, use the uploaded image
      treeData.image = imageUrl;
      
      // Add new tree to Firestore
      await addDoc(treesCollectionRef, treeData);
    }

    alert("Tree saved successfully!");
    modal.style.display = "none";
    clearForm(); // Clear the form
    await updateStatistics(); // Update stats first
    await loadTrees(); // Then update table
  } catch (error) {
    console.error("Error saving tree:", error);
    alert("Error saving tree!");
  }
}

// Edit tree
window.editTree = async function (id) {
  try {
    const docRef = doc(db, "tree_inventory", id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();

      // Populate the form with existing tree data
      document.getElementById("treeId").value = id; // Store treeId to reference it later
      document.getElementById("name").value = data.name;
      document.getElementById("description").value = data.description;
      document.getElementById("type").value = data.type;

      // Show the image preview only if an image exists
      const imageElement = document.getElementById("treeImagePreview");
      if (data.image) {
        imageElement.src = data.image;
        imageElement.style.display = "block"; // Display the image
      } else {
        imageElement.style.display = "none"; // Hide if no image exists
      }

      modal.style.display = "flex"; // Show the modal for editing
    }
  } catch (error) {
    console.error("Error loading tree details:", error);
    alert("Error loading tree details!");
  }
};

// Populate tree select dropdown
async function populateTreeSelect() {
  const treeSelect = document.getElementById('treeSelect');
  treeSelect.innerHTML = '<option value="">Select a Tree</option>'; // Reset

  try {
    const seedlingSnapshot = await getDocs(treesCollectionRef);
    
    seedlingSnapshot.forEach((doc) => {
      const tree = { id: doc.id, ...doc.data() };
      const option = document.createElement('option');
      option.value = tree.id;
      option.textContent = `${tree.name} (${tree.type}) - Current Stock: ${tree.stocks || 0}`;
      treeSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Error populating tree select:", error);
    alert("Error loading trees for stock management!");
  }
}

// Add stock modal functionality
const stockModal = document.getElementById("stockModal");
const addStockBtn = document.getElementById("addStock");
const stockCloseBtn = stockModal.querySelector(".close");

addStockBtn.onclick = () => {
  populateTreeSelect();
  stockModal.style.display = "flex";
};

stockCloseBtn.onclick = () => {
  stockModal.style.display = "none";
  document.getElementById("stockForm").reset();
};

// Save stock changes
async function saveStockChanges(event) {
  event.preventDefault();

  const treeId = document.getElementById('treeSelect').value;
  const operation = document.getElementById('stockOperation').value;
  const stockAmount = parseInt(document.getElementById('stockAmount').value);

  if (!treeId || !operation || !stockAmount) {
    alert("Please fill all fields correctly!");
    return;
  }

  try {
    const treeRef = doc(db, "tree_inventory", treeId);
    const treeDoc = await getDoc(treeRef);

    if (!treeDoc.exists()) {
      alert("Selected tree not found!");
      return;
    }

    const treeData = treeDoc.data();
    let currentStocks = treeData.stocks || 0;

    // Perform stock operation
    switch (operation) {
      case 'delivered':
      case 'grown':
        currentStocks += stockAmount;
        break;
      case 'requested':
        if (stockAmount > currentStocks) {
          alert(`Insufficient stocks! Current stock: ${currentStocks}`);
          return;
        }
        currentStocks -= stockAmount;
        break;
    }

    // Update the tree document
    await updateDoc(treeRef, {
      stocks: currentStocks,
      lastUpdated: serverTimestamp()
    });

    // Log the stock entry
    await logStockEntry(treeId, operation, stockAmount);

    alert("Stock updated successfully!");
    stockModal.style.display = "none";
    document.getElementById("stockForm").reset();
    
    await updateStatistics(); // Update global stats
    await loadTrees(); // Reload and re-render the trees
    await loadStockEntries(); // Reload stock entries
  } catch (error) {
    console.error("Error updating stocks:", error);
    alert("Error updating stocks!");
  }
}


// Add event listener for saving stock changes
document.getElementById("saveStock").addEventListener("click", saveStockChanges);

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

// Modify existing initialization
async function initializePage() {
  await updateStatistics();
  await loadTrees();
  await loadStockEntries();
}

// Update event listeners to work with pagination
document.getElementById("saveTree").addEventListener("click", async (event) => {
  await saveTree(event);
  await initializePage(); // Reload and re-render after saving
});

document.getElementById("searchInput").addEventListener("input", () => {
  currentPage = 1; // Reset to first page
  loadTrees();
});

document.getElementById("typeFilter").addEventListener("change", () => {
  currentPage = 1; // Reset to first page
  loadTrees();
});

// Initial load
initializePage();