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

    // Load trees
      const treeItems = document.getElementById("treeItems");
      treeItems.innerHTML = "";

      seedlingSnapshot.forEach((doc) => {
        const tree = { id: doc.id, ...doc.data() };
        if (matchesFilters(tree, searchTerm, typeFilter)) {
          appendTreeToTable(tree, treeItems, true);
        }
      });
    
  } catch (error) {
    console.error("Error loading trees:", error);
    alert("Error loading tree inventory!");
  }
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

async function initializePage() {
  await updateStatistics();
  await loadTrees();
}

// Event listeners
document.getElementById("saveTree").addEventListener("click", saveTree);
document
  .getElementById("searchInput")
  .addEventListener("input", loadTrees);
document
  .getElementById("typeFilter")
  .addEventListener("change", loadTrees);

// Initial load
initializePage();