import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
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
  signOut
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
const treesCollectionRef = collection(db, "trees");
const removedTreesCollectionRef = collection(db, "removed_trees");

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

window.onload = () => {
  loadTrees();
  loadRemovedTrees();
};

async function loadTrees() {
  try {
    const querySnapshot = await getDocs(treesCollectionRef);
    const treeItems = document.getElementById("treeItems");
    const treeTable = document.getElementById("treeTable");
    treeItems.innerHTML = "";

    if (querySnapshot.empty) {
      // Show no data message
    } else {
      treeTable.style.display = "table";

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const treeRow = document.createElement("tr");
        treeRow.innerHTML = `
          <td>${data.name}</td>
          <td><img src="${data.image}" alt="${data.name}"></td>
          <td>${data.description}</td>
          <td>${data.treeCost}</td>
          <td>${data.type}</td>
          <td>${data.availableTrees}</td>
          <td>
            ${`<button class="remove-tree-btn" data-id="${doc.id}" style="background: red;">
                     <i class="fas fa-trash"></i> Archive
                   </button>`}
          </td>
        `;
        treeItems.appendChild(treeRow);

        // Add event listener for remove button if stock is 0
        const removeBtn = treeRow.querySelector(".remove-tree-btn");
        if (removeBtn) {
          removeBtn.addEventListener("click", () =>
            removeTree(doc.id, data)
          );
        }
      });
    }
  } catch (error) {
    console.error("Error loading trees: ", error);
  }
}

async function loadRemovedTrees() {
  try {
    const querySnapshot = await getDocs(removedTreesCollectionRef);
    const removedTreeItems = document.getElementById("removedTreeItems");
    removedTreeItems.innerHTML = "";

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const treeRow = document.createElement("tr");
      const removedDate = data.removedAt
        ? new Date(data.removedAt.toDate()).toLocaleDateString()
        : "N/A";

      treeRow.innerHTML = `
        <td>${data.name}</td>
        <td><img src="${data.image}" alt="${data.name}"></td>
        <td>${data.description}</td>
        <td>${data.type}</td>
        <td>${removedDate}</td>
        <td>
          <button class="restock-btn" data-id="${doc.id}">
            <i class="fas fa-plus"></i> Restock
          </button>
        </td>
      `;
      removedTreeItems.appendChild(treeRow);

      // Add event listener for restock button
      const restockBtn = treeRow.querySelector(".restock-btn");
      restockBtn.addEventListener("click", () =>
        openRestockModal(doc.id, data)
      );
    });
  } catch (error) {
    console.error("Error loading archived trees: ", error);
  }
}

async function removeTree(treeId, treeData) {
  if (!confirm("Are you sure you want to archive this tree?")) return;

  try {
    // Get the tree from inventory by name
    const inventorySnapshot = await getDocs(
      query(
        collection(db, "tree_inventory"),
        where("name", "==", treeData.name)
      )
    );

    if (inventorySnapshot.empty) {
      alert("Tree not found in inventory!");
      return;
    }

    const inventoryDoc = inventorySnapshot.docs[0];

    // Add to removed_trees collection with the correct inventory ID
    await addDoc(removedTreesCollectionRef, {
      ...treeData,
      removedAt: serverTimestamp(),
      originalTreeId: inventoryDoc.id, // Store the inventory document ID
      inventoryName: treeData.name, // Store the name for reference
    });

    // Delete from trees collection
    await deleteDoc(doc(db, "trees", treeId));

    alert("Tree was archived successfully!");
    loadTrees();
    loadRemovedTrees();
  } catch (error) {
    console.error("Error archiving tree:", error);
    alert("Error archiving tree!");
  }
}

// Restock Modal Controls
const restockModal = document.getElementById("restockModal");
const restockCloseBtn = restockModal.querySelector(".close");

restockCloseBtn.onclick = () => {
  restockModal.style.display = "none";
  document.getElementById("restockForm").reset();
};

async function openRestockModal(removedTreeId, treeData) {
  try {
    // First try to get the tree from inventory using originalTreeId
    let treeInventoryDoc = null;

    if (treeData.originalTreeId) {
      treeInventoryDoc = await getDoc(
        doc(db, "tree_inventory", treeData.originalTreeId)
      );
    }

    // If not found by ID, try to find by name
    if (!treeInventoryDoc || !treeInventoryDoc.exists()) {
      const inventorySnapshot = await getDocs(
        query(
          collection(db, "tree_inventory"),
          where("name", "==", treeData.name)
        )
      );

      if (inventorySnapshot.empty) {
        alert("Tree not found in inventory!");
        return;
      }

      treeInventoryDoc = inventorySnapshot.docs[0];
      // Update the originalTreeId in the removed_trees collection
      await updateDoc(doc(db, "removed_trees", removedTreeId), {
        originalTreeId: treeInventoryDoc.id,
      });
    }

    // Get current stock from stock_entries
    const stockSnapshot = await getDocs(collection(db, "stock_entries"));
    let totalStock = 0;
    stockSnapshot.forEach((doc) => {
      const entry = doc.data();
      if (entry.treeId === treeInventoryDoc.id) {
        totalStock += entry.quantity;
      }
    });

    // Update the modal with tree details
    document.getElementById("restockTreeName").value = treeData.name;
    const restockForm = document.getElementById("restockForm");

    // Add previous cost display if it doesn't exist
    if (!document.getElementById("previousCost")) {
      const previousCostDiv = document.createElement("div");
      previousCostDiv.className = "form-group";
      previousCostDiv.innerHTML = `
  <label>Previous Points Cost:</label>
  <input type="number" id="previousCost" readonly>
`;
      restockForm.insertBefore(
        previousCostDiv,
        document.getElementById("restockCost").parentNode
      );
    }

    // Create available stock display if it doesn't exist
    if (!document.getElementById("restockAvailableStock")) {
      const stockDiv = document.createElement("div");
      stockDiv.className = "form-group";
      stockDiv.innerHTML = `
  <label>Available Stock:</label>
  <input type="number" id="restockAvailableStock" readonly>
`;
      restockForm.insertBefore(
        stockDiv,
        document.getElementById("restockAmount").parentNode
      );
    }

    // Set the previous cost value
    document.getElementById("previousCost").value =
      treeData.treeCost || "N/A";
    // Pre-fill the restock cost with the previous cost
    document.getElementById("restockCost").value =
      treeData.treeCost || "";
    document.getElementById("restockAvailableStock").value = totalStock;
    restockModal.setAttribute("data-removed-tree-id", removedTreeId);
    restockModal.setAttribute(
      "data-tree-data",
      JSON.stringify({
        ...treeData,
        originalTreeId: treeInventoryDoc.id, // Ensure we're using the correct ID
      })
    );
    restockModal.style.display = "flex";

    // Add input validation for restock amount
    const restockAmountInput = document.getElementById("restockAmount");
    restockAmountInput.max = totalStock;

    // Remove any existing event listener to prevent duplicates
    const newRestockAmountInput = restockAmountInput.cloneNode(true);
    restockAmountInput.parentNode.replaceChild(
      newRestockAmountInput,
      restockAmountInput
    );

    newRestockAmountInput.addEventListener("input", function () {
      if (parseInt(this.value) > totalStock) {
        alert(`Cannot allocate more than ${totalStock} trees`);
        this.value = totalStock;
      }
    });
  } catch (error) {
    console.error("Error loading tree inventory data:", error);
    alert("Error loading tree inventory data!");
  }
}

document
  .getElementById("restockForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const removedTreeId = restockModal.getAttribute(
      "data-removed-tree-id"
    );
    const treeData = JSON.parse(
      restockModal.getAttribute("data-tree-data")
    );
    const restockAmount = parseInt(
      document.getElementById("restockAmount").value
    );
    const newCost = parseInt(
      document.getElementById("restockCost").value
    );
    const availableStock = parseInt(
      document.getElementById("restockAvailableStock").value
    );

    if (restockAmount > availableStock) {
      alert(`Cannot allocate more than ${availableStock} trees`);
      return;
    }

    try {
      // Check if the tree already exists in active trees
      const activeTreeQuery = await getDocs(
        query(treesCollectionRef, where("name", "==", treeData.name))
      );

      if (!activeTreeQuery.empty) {
        alert(
          "This tree already exists in active trees. Please remove the existing entry first."
        );
        return;
      }

      // Rest of the restock logic remains the same
      const treeInventoryRef = doc(
        db,
        "tree_inventory",
        treeData.originalTreeId
      );
      const treeInventoryDoc = await getDoc(treeInventoryRef);

      if (!treeInventoryDoc.exists()) {
        alert("Tree not found in inventory!");
        return;
      }

      // Get current stock from stock_entries
      const stockSnapshot = await getDocs(
        collection(db, "stock_entries")
      );
      let totalStock = 0;
      stockSnapshot.forEach((doc) => {
        const entry = doc.data();
        if (entry.treeId === treeData.originalTreeId) {
          totalStock += entry.quantity;
        }
      });

      // Add back to trees collection
      await addDoc(treesCollectionRef, {
        ...treeData,
        availableTrees: restockAmount.toString(),
        treeCost: newCost.toString(),
        timestamp: serverTimestamp(),
      });

      // Add stock history entry
      await addDoc(collection(db, "stock_entries"), {
        treeId: treeData.originalTreeId,
        treeName: treeData.name,
        treeImage: treeData.image,
        quantity: -restockAmount,
        operation: "allotted",
        notes: "Allocated to TreeStride app",
        timestamp: serverTimestamp(),
      });

      // Update the tree_inventory
      await updateDoc(treeInventoryRef, {
        stocks: totalStock - restockAmount,
      });

      // Delete from removed_trees
      await deleteDoc(doc(db, "removed_trees", removedTreeId));

      alert("Tree restocked successfully!");
      restockModal.style.display = "none";
      document.getElementById("restockForm").reset();
      loadTrees();
      loadRemovedTrees();
    } catch (error) {
      console.error("Error restocking tree:", error);
      alert("Error restocking tree!");
    }
  });

let selectedTreeData = null;

// Modal controls
const addTreeModal = document.getElementById("addTreeModal");
const addTreeBtn = document.getElementById("addTreeBtn");
const closeBtn = addTreeModal.querySelector(".close");

addTreeBtn.onclick = () => {
  addTreeModal.style.display = "flex";
  loadTreeInventory();
};

closeBtn.onclick = () => {
  addTreeModal.style.display = "none";
  document.getElementById("addTreeForm").reset();
  document.getElementById("treeDetails").style.display = "none";
};

// Load trees from inventory
async function loadTreeInventory() {
  const selectTree = document.getElementById("selectTree");
  selectTree.innerHTML = '<option value="">Select a tree...</option>';

  try {
    const querySnapshot = await getDocs(collection(db, "tree_inventory"));

    // Get stock data
    const stockSnapshot = await getDocs(collection(db, "stock_entries"));
    const stocksByTree = {};

    stockSnapshot.forEach((doc) => {
      const entry = doc.data();
      stocksByTree[entry.treeId] =
        (stocksByTree[entry.treeId] || 0) + entry.quantity;
    });

    querySnapshot.forEach((doc) => {
      const tree = doc.data();
      const stock = stocksByTree[doc.id] || 0;
      if (stock > 0) {
        // Only show trees with available stock
        const option = document.createElement("option");
        option.value = doc.id;
        option.textContent = tree.name;
        selectTree.appendChild(option);
      }
    });
  } catch (error) {
    console.error("Error loading tree inventory:", error);
    alert("Error loading tree inventory!");
  }
}

// Handle tree selection
document
  .getElementById("selectTree")
  .addEventListener("change", async (e) => {
    const treeId = e.target.value;
    const treeDetails = document.getElementById("treeDetails");

    if (!treeId) {
      treeDetails.style.display = "none";
      return;
    }

    try {
      const treeDoc = await getDoc(doc(db, "tree_inventory", treeId));
      if (treeDoc.exists()) {
        selectedTreeData = { id: treeDoc.id, ...treeDoc.data() };

        // Get current stock
        const stockSnapshot = await getDocs(
          collection(db, "stock_entries")
        );
        let totalStock = 0;
        stockSnapshot.forEach((doc) => {
          const entry = doc.data();
          if (entry.treeId === treeId) {
            totalStock += entry.quantity;
          }
        });

        selectedTreeData.availableStock = totalStock;

        // Fill form fields
        document.getElementById("treeName").value = selectedTreeData.name;
        document.getElementById("treeDescription").value =
          selectedTreeData.description;
        document.getElementById("treeType").value = selectedTreeData.type;
        document.getElementById("availableStock").value = totalStock;

        treeDetails.style.display = "block";
      }
    } catch (error) {
      console.error("Error loading tree details:", error);
      alert("Error loading tree details!");
    }
  });

// Validate allocated trees input
document
  .getElementById("allocatedTrees")
  .addEventListener("input", function () {
    const availableStock = parseInt(
      document.getElementById("availableStock").value
    );
    if (this.value > availableStock) {
      alert(`Cannot allocate more than ${availableStock} trees`);
      this.value = availableStock;
    }
  });

// Handle form submission
document
  .getElementById("addTreeForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const allocatedTrees = parseInt(
      document.getElementById("allocatedTrees").value
    );
    const treeCost = parseInt(document.getElementById("treeCost").value);
    const treeName = document.getElementById("treeName").value;

    if (!selectedTreeData) {
      alert("Please select a tree first");
      return;
    }

    try {
      // Check for duplicates in both collections
      const isDuplicate = await checkForDuplicateTree(treeName);

      if (isDuplicate) {
        alert(
          "This tree already exists. Please choose a different tree."
        );
        addTreeModal.style.display = "none";
        document.getElementById("addTreeForm").reset();
        return;
      }

      // Add to trees collection
      await addDoc(collection(db, "trees"), {
        name: selectedTreeData.name,
        description: selectedTreeData.description,
        treeCost: treeCost.toString(),
        type: selectedTreeData.type,
        image: selectedTreeData.image,
        availableTrees: allocatedTrees.toString(),
        timestamp: serverTimestamp(),
      });

      // Add stock history entry
      await addDoc(collection(db, "stock_entries"), {
        treeId: selectedTreeData.id,
        quantity: -allocatedTrees,
        operation: "allotted",
        notes: "Allocated to TreeStride app",
        timestamp: serverTimestamp(),
      });

      // Update the tree_inventory collection
      await updateDoc(doc(db, "tree_inventory", selectedTreeData.id), {
        stocks: selectedTreeData.availableStock - allocatedTrees,
      });

      alert("Tree added successfully!");
      addTreeModal.style.display = "none";
      document.getElementById("addTreeForm").reset();
      loadTrees();
    } catch (error) {
      console.error("Error saving tree:", error);
      alert("Error saving tree!");
    }
  });

async function checkForDuplicateTree(treeName) {
  try {
    // Check active trees
    const activeTreeQuery = await getDocs(
      query(treesCollectionRef, where("name", "==", treeName))
    );

    // Check removed trees
    const removedTreeQuery = await getDocs(
      query(removedTreesCollectionRef, where("name", "==", treeName))
    );

    return !activeTreeQuery.empty || !removedTreeQuery.empty;
  } catch (error) {
    console.error("Error checking for duplicates:", error);
    throw error;
  }
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