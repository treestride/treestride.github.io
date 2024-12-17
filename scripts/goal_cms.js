import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const auth = getAuth(app);
const db = getFirestore(app);

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

// Add loading state management
function showLoading() {
  document.getElementById("loadingOverlay").style.display = "flex";
  document.querySelector(".navigation").classList.add("hidden");
  document.getElementById("sign-out").disabled = true;
}

function hideLoading() {
  document.getElementById("loadingOverlay").style.display = "none";
  document.querySelector(".navigation").classList.remove("hidden");
  document.getElementById("sign-out").disabled = false;
}

// Check authentication state
onAuthStateChanged(auth, async (user) => {
  showLoading();
  if (user) {
    const email = user.email;
    const userRoleDisplay = document.getElementById("user-role-display");

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
      const currentPage = window.location.pathname.split("/").pop();
      const userData = staffDoc.data();
      userRoleDisplay.textContent = `${userData.username} (${userData.role})`;

      // Check page access
      const allowedRoles = PAGE_PERMISSIONS[currentPage] || [];
      if (!allowedRoles.includes(userRole)) {
        if (userRole === "forester") {
          // Redirect foresters to tree inventory
          window.location.href = "dashboard.html";
        } else {
          // Redirect sub-admins to dashboard
          window.location.href = "dashboard.html";
        }
        return;
      }

      // Update navigation visibility
      const navigation = document.querySelector(".navigation");
      const links = navigation.getElementsByTagName("a");

      for (let link of links) {
        const href = link.getAttribute("href");
        const linkAllowedRoles = PAGE_PERMISSIONS[href] || [];

        if (!linkAllowedRoles.includes(userRole)) {
          link.style.display = "none";
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

// Walking Goals
window.addWalkingGoal = async function () {
  const goalInput = document.getElementById("walkingGoal");
  const goal = parseInt(goalInput.value);

  if (!goal || goal < 5000) {
    alert("Please enter a walking goal of at least 5,000 steps.");
    return;
  }

  try {
    // Check for duplicate goals
    const q = query(
      collection(db, "walkingGoals"), 
      where("goal", "==", goal.toString())
    );
    const duplicateSnapshot = await getDocs(q);

    if (!duplicateSnapshot.empty) {
      alert("This walking goal already exists. Please enter a different goal.");
      return;
    }

    await addDoc(collection(db, "walkingGoals"), {
      goal: goal.toString(),
    });
    alert("Goal steps added.");
    goalInput.value = "";
    loadWalkingGoals();
  } catch (error) {
    console.error("Error adding goal:", error);
  }
};

async function loadWalkingGoals() {
  const goalsList = document.getElementById("walkingGoalList");
  goalsList.innerHTML = "";

  try {
    const querySnapshot = await getDocs(collection(db, "walkingGoals"));
    const goals = [];
    
    querySnapshot.forEach((doc) => {
      goals.push({
        id: doc.id,
        goal: parseInt(doc.data().goal)
      });
    });

    // Sort goals from lowest to highest
    goals.sort((a, b) => a.goal - b.goal);

    goals.forEach((goalItem) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${goalItem.goal} steps</span>
        <button class="delete-btn" onclick="deleteWalkingGoal('${goalItem.id}')">Delete</button>
      `;
      goalsList.appendChild(li);
    });
  } catch (error) {
    console.error("Error fetching goals:", error);
  }
}

window.deleteWalkingGoal = async function (id) {
  // Add confirmation before deleting
  if (confirm("Are you sure you want to delete this walking goal?")) {
    try {
      await deleteDoc(doc(db, "walkingGoals", id));
      loadWalkingGoals();
    } catch (error) {
      console.error("Error deleting goal:", error);
    }
  }
};

// Jogging Goals
window.addJoggingGoal = async function () {
  const goalInput = document.getElementById("joggingGoal");
  const goal = parseInt(goalInput.value);

  if (!goal || goal < 5000) {
    alert("Please enter a jogging goal of at least 5,000 steps.");
    return;
  }

  try {
    // Check for duplicate goals
    const q = query(
      collection(db, "joggingGoals"), 
      where("goal", "==", goal.toString())
    );
    const duplicateSnapshot = await getDocs(q);

    if (!duplicateSnapshot.empty) {
      alert("This jogging goal already exists. Please enter a different goal.");
      return;
    }

    await addDoc(collection(db, "joggingGoals"), {
      goal: goal.toString(),
    });
    alert("Goal steps added.");
    goalInput.value = "";
    loadJoggingGoals();
  } catch (error) {
    console.error("Error adding goal:", error);
  }
};

async function loadJoggingGoals() {
  const goalsList = document.getElementById("joggingGoalList");
  goalsList.innerHTML = "";

  try {
    const querySnapshot = await getDocs(collection(db, "joggingGoals"));
    const goals = [];
    
    querySnapshot.forEach((doc) => {
      goals.push({
        id: doc.id,
        goal: parseInt(doc.data().goal)
      });
    });

    // Sort goals from lowest to highest
    goals.sort((a, b) => a.goal - b.goal);

    goals.forEach((goalItem) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${goalItem.goal} steps</span>
        <button class="delete-btn" onclick="deleteJoggingGoal('${goalItem.id}')">Delete</button>
      `;
      goalsList.appendChild(li);
    });
  } catch (error) {
    console.error("Error fetching goals:", error);
  }
}

window.deleteJoggingGoal = async function (id) {
  // Add confirmation before deleting
  if (confirm("Are you sure you want to delete this jogging goal?")) {
    try {
      await deleteDoc(doc(db, "joggingGoals", id));
      loadJoggingGoals();
    } catch (error) {
      console.error("Error deleting goal:", error);
    }
  }
};

// Running Goals
window.addRunningGoal = async function () {
  const goalInput = document.getElementById("runningGoal");
  const goal = parseInt(goalInput.value);

  if (!goal || goal < 5000) {
    alert("Please enter a running goal of at least 5,000 steps.");
    return;
  }

  try {
    // Check for duplicate goals
    const q = query(
      collection(db, "runningGoals"), 
      where("goal", "==", goal.toString())
    );
    const duplicateSnapshot = await getDocs(q);

    if (!duplicateSnapshot.empty) {
      alert("This running goal already exists. Please enter a different goal.");
      return;
    }

    await addDoc(collection(db, "runningGoals"), {
      goal: goal.toString(),
    });
    alert("Goal steps added.");
    goalInput.value = "";
    loadRunningGoals();
  } catch (error) {
    console.error("Error adding goal:", error);
  }
};

async function loadRunningGoals() {
  const goalsList = document.getElementById("runningGoalList");
  goalsList.innerHTML = "";

  try {
    const querySnapshot = await getDocs(collection(db, "runningGoals"));
    const goals = [];
    
    querySnapshot.forEach((doc) => {
      goals.push({
        id: doc.id,
        goal: parseInt(doc.data().goal)
      });
    });

    // Sort goals from lowest to highest
    goals.sort((a, b) => a.goal - b.goal);

    goals.forEach((goalItem) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${goalItem.goal} steps</span>
        <button class="delete-btn" onclick="deleteRunningGoal('${goalItem.id}')">Delete</button>
      `;
      goalsList.appendChild(li);
    });
  } catch (error) {
    console.error("Error fetching goals:", error);
  }
}

window.deleteRunningGoal = async function (id) {
  // Add confirmation before deleting
  if (confirm("Are you sure you want to delete this running goal?")) {
    try {
      await deleteDoc(doc(db, "runningGoals", id));
      loadRunningGoals();
    } catch (error) {
      console.error("Error deleting goal:", error);
    }
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

// Load goals when the page loads
document.addEventListener("DOMContentLoaded", () => {
  loadWalkingGoals();
  loadJoggingGoals();
  loadRunningGoals();
});