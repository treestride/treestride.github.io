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
  updateDoc,
  query,
  orderBy,
  limit,
  startAfter,
  endBefore,
  limitToLast,
  getDoc,
  addDoc,
  Timestamp,
  GeoPoint,
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
  showLoading()
  if (user) {
    const email = user.email;
    const userRoleDisplay = document.getElementById('user-role-display');
    
    // Allow admin full access
    if (email === "admin@gmail.com") {
      userRoleDisplay.textContent = "Admin";
      hideLoading();
      fetchPlantRequests();
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
      if (currentPage === 'planting_requests.html') {
        fetchPlantRequests();
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

// Add pagination state
const ITEMS_PER_PAGE = 10;
let currentPage = 1;
let lastVisible = null;
let firstVisible = null;
let totalPages = 0;

let map;
let marker;
let currentPlantRequest;
let selectedRequests = new Set();

function initMap(lat = null, lng = null, existingMarker = null) {
  if (map) {
    map.remove();
  }

  // Initialize map with default center (will be updated)
  map = L.map("map").setView([0, 0], 13);

  // Add tile layer
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  if (existingMarker) {
    // Case 1: Use existing marker location
    if (
      typeof existingMarker.lat === "number" &&
      typeof existingMarker.lng === "number"
    ) {
      map.setView([existingMarker.lat, existingMarker.lng], 13);
      marker = L.marker([existingMarker.lat, existingMarker.lng]).addTo(
        map
      );
      updateCoordinateInputs(existingMarker.lat, existingMarker.lng);
    } else {
      console.error(
        "Invalid latitude or longitude values in existingMarker:",
        existingMarker
      );
    }
  } else if (typeof lat === "number" && typeof lng === "number") {
    // Case 2: Use provided coordinates
    map.setView([lat, lng], 13);
    marker = L.marker([lat, lng]).addTo(map);
    updateCoordinateInputs(lat, lng);
  } else {
    // Case 3: No existing coordinates, use device location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const currentLat = position.coords.latitude;
          const currentLng = position.coords.longitude;
          map.setView([currentLat, currentLng], 13);
          marker = L.marker([currentLat, currentLng]).addTo(map);
          updateCoordinateInputs(currentLat, currentLng);
        },
        () => {
          console.error("Error getting location");
          // Set default view if geolocation fails
          map.setView([0, 0], 13);
        }
      );
    }
  }

  map.on("click", onMapClick);
}

// Helper function to update coordinate inputs (unchanged)
function updateCoordinateInputs(lat, lng) {
  document.getElementById("lat").value = lat;
  document.getElementById("long").value = lng;
}

async function fetchPlantRequests(direction = "next") {
  try {
    let q;
    const plantRequestsCollection = collection(db, "plant_requests");

    if (direction === "next" && lastVisible) {
      q = query(
        plantRequestsCollection,
        orderBy("timestamp", "desc"),
        startAfter(lastVisible),
        limit(ITEMS_PER_PAGE)
      );
    } else if (direction === "prev" && firstVisible) {
      q = query(
        plantRequestsCollection,
        orderBy("timestamp", "desc"),
        endBefore(firstVisible),
        limitToLast(ITEMS_PER_PAGE)
      );
    } else {
      // Default query for first page
      q = query(
        plantRequestsCollection,
        orderBy("timestamp", "desc"),
        limit(ITEMS_PER_PAGE)
      );
    }

    const querySnapshot = await getDocs(q);
    const docs = querySnapshot.docs;
    const paginationDiv = document.querySelector(".pagination");

    // Check if we have any documents
    if (docs.length > 0) {
      lastVisible = docs[docs.length - 1];
      firstVisible = docs[0];

      const plantRequests = docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      displayPlantRequests(plantRequests);

      if (paginationDiv) {
        paginationDiv.style.display = "flex";
      }
      updatePaginationControls(querySnapshot);
    } else {
      // If no documents found and we're not on the first page
      if (currentPage > 1) {
        currentPage--;
        await fetchPlantRequests("prev");
      } else {
        // If we're on the first page and no documents
        displayPlantRequests([]);
        if (paginationDiv) {
          paginationDiv.style.display = "none";
        }
      }
    }
  } catch (error) {
    console.error("Error fetching plant requests:", error);
    alert("Error loading plant requests");
  }
}

// Function to get unique tree names
async function populateTreeNameDropdown() {
  try {
    const plantRequestsCollection = collection(db, "plant_requests");
    const querySnapshot = await getDocs(plantRequestsCollection);
    const treeNames = new Set();

    querySnapshot.forEach((doc) => {
      const treeName = doc.data().treeName;
      if (treeName) {
        treeNames.add(treeName);
      }
    });

    const dropdown = document.getElementById("tree-name-filter");
    const sortedTreeNames = Array.from(treeNames).sort();

    sortedTreeNames.forEach((treeName) => {
      const option = document.createElement("option");
      option.value = treeName.toLowerCase();
      option.textContent = treeName;
      dropdown.appendChild(option);
    });
  } catch (error) {
    console.error("Error populating tree names:", error);
  }
}

// Update pagination controls
function updatePaginationControls(querySnapshot) {
  const prevButton = document.getElementById("prev-page");
  const nextButton = document.getElementById("next-page");
  const pageInfo = document.getElementById("page-info");

  prevButton.disabled = currentPage === 1;
  nextButton.disabled = querySnapshot.docs.length < ITEMS_PER_PAGE;

  pageInfo.textContent = `Page ${currentPage}`;
}

function displayPlantRequests(plantRequests) {
  const tableBody = document.getElementById("plant-requests-body");
  const batchControls = document.querySelector(".batch-controls");
  tableBody.innerHTML = "";

  if (!plantRequests || plantRequests.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `
<td colspan="7" style="text-align: center;">
  <div class="empty-state">
    <i class="fa-regular fa-folder-open"></i>
    <p>No planting requests found</p>
  </div>
</td>
`;
    tableBody.appendChild(emptyRow);

    return;
  }

  selectedRequests.clear();

  plantRequests.forEach((request) => {
    if (!request) return;

    const timestamp = request.timestamp?.toDate() || new Date();
    const formattedDate = timestamp.toLocaleString();
    const isPending = request.plantingStatus === "pending";
    const isApproved = request.plantingStatus === "approved";

    const row = document.createElement("tr");
    row.setAttribute("data-request-id", request.id);
    row.className = "row";
    row.innerHTML = `
<td class="checkbox-cell">
  ${
    isPending
      ? `<input type="checkbox" class="request-checkbox" data-id="${request.id}"/>`
      : ""
  }
</td>
<td>${request.username || "N/A"}</td>
<td>${request.treeName || "N/A"}</td>
<td>${request.treeType || "N/A"}</td>
<td class="status-cell" data-field="status">
    ${request.plantingStatus || "N/A"}
</td>
<td class="timestamp">${formattedDate}</td>
`;
    tableBody.appendChild(row);
  });
}

// Add pagination event listeners
document.getElementById("prev-page").addEventListener("click", () => {
  currentPage--;
  fetchPlantRequests("prev");
});

document.getElementById("next-page").addEventListener("click", () => {
  currentPage++;
  fetchPlantRequests("next");
});

async function selectFilteredRequests() {
  const startDate = new Date(document.getElementById("start-date").value);
  const endDate = new Date(document.getElementById("end-date").value);
  const selectedTreeName = document
    .getElementById("tree-name-filter")
    .value.toLowerCase();
  endDate.setHours(23, 59, 59, 999);

  if (startDate > endDate) {
    alert("Start date must be before end date");
    return;
  }

  selectedRequests.clear();

  const checkboxes = document.querySelectorAll(".request-checkbox");

  checkboxes.forEach((checkbox) => {
    const row = checkbox.closest("tr");
    const timestampCell = row.querySelector(".timestamp");
    const statusCell = row.querySelector(".status-cell");
    const treeNameCell = row.querySelector("td:nth-child(3)");

    if (timestampCell && statusCell && treeNameCell) {
      const requestDate = new Date(timestampCell.textContent);
      const status = statusCell.textContent.trim();
      const rowTreeName = treeNameCell.textContent.toLowerCase().trim();

      const dateInRange =
        requestDate >= startDate && requestDate <= endDate;
      const treeNameMatch =
        !selectedTreeName || rowTreeName === selectedTreeName;
      const isPending = status === "pending";

      if (isPending && dateInRange && treeNameMatch) {
        checkbox.checked = true;
        selectedRequests.add(checkbox.getAttribute("data-id"));
      } else {
        checkbox.checked = false;
      }
    }
  });

  if (selectedRequests.size > 0) {
    openUpdateModal(Array.from(selectedRequests));
  } else {
    alert("No pending requests found matching the selected filters");
  }
}

function initializeFilters() {
  const startDateInput = document.getElementById("start-date");
  const endDateInput = document.getElementById("end-date");
  const filterButton = document.getElementById("filter-date-btn");

  const today = new Date();
  endDateInput.value = today.toISOString().split("T")[0];

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  startDateInput.value = sevenDaysAgo.toISOString().split("T")[0];

  filterButton.addEventListener("click", selectFilteredRequests);

  // Populate the tree names dropdown when initializing
  populateTreeNameDropdown();
}

async function selectRequestsByDateRange() {
  const startDate = new Date(document.getElementById("start-date").value);
  const endDate = new Date(document.getElementById("end-date").value);
  endDate.setHours(23, 59, 59, 999); // Include the entire end date

  if (startDate > endDate) {
    alert("Start date must be before end date");
    return;
  }

  // Clear existing selections
  selectedRequests.clear();

  // Get all checkboxes
  const checkboxes = document.querySelectorAll(".request-checkbox");

  checkboxes.forEach((checkbox) => {
    const row = checkbox.closest("tr");
    const timestampCell = row.querySelector(".timestamp");
    const statusCell = row.querySelector(".status-cell");

    if (timestampCell && statusCell) {
      const requestDate = new Date(timestampCell.textContent);
      const status = statusCell.textContent.trim();

      if (
        status === "pending" &&
        requestDate >= startDate &&
        requestDate <= endDate
      ) {
        checkbox.checked = true;
        selectedRequests.add(checkbox.getAttribute("data-id"));
      } else {
        checkbox.checked = false;
      }
    }
  });

  if (selectedRequests.size > 0) {
    openUpdateModal(Array.from(selectedRequests));
  } else {
    alert("No pending requests found in the selected date range");
  }
}

// Modified openUpdateModal function to handle coordinates
async function openUpdateModal(requestIds) {
  const modal = document.getElementById("update-modal");
  modal.style.display = "block";

  document.getElementById(
    "selected-count"
  ).textContent = `Selected Requests: ${requestIds.length}`;

  try {
    // Get the first request's details to check for existing coordinates
    const requestRef = doc(db, "plant_requests", requestIds[0]);
    const requestDoc = await getDoc(requestRef);
    const requestData = requestDoc.data();

    // Initialize map based on existing coordinates or device location
    if (requestData.latitude && requestData.longitude) {
      // Use saved coordinates
      initMap(requestData.latitude, requestData.longitude, {
        lat: requestData.latitude,
        lng: requestData.longitude,
      });
    } else {
      // No saved coordinates, initialize with device location
      initMap();
    }

    // Set up form submission for batch update
    document.getElementById("update-form").onsubmit = (e) => {
      e.preventDefault();
      updatePlantRequests(requestIds);
    };
  } catch (error) {
    console.error("Error opening update modal:", error);
    alert("Error opening update modal");
  }
}

// Update the onMapClick function to handle marker updates
function onMapClick(e) {
  const lat = e.latlng.lat;
  const lng = e.latlng.lng;

  // Update input fields
  document.getElementById("lat").value = lat;
  document.getElementById("long").value = lng;

  // Update or add marker
  if (marker) {
    marker.setLatLng(e.latlng);
  } else {
    marker = L.marker(e.latlng).addTo(map);
  }
}

async function updatePlantRequests(requestIds) {
  const status = document.getElementById("status").value;
  const lat = document.getElementById("lat").value;
  const long = document.getElementById("long").value;
  const announcementTitle =
    document.getElementById("announcement-title").value;
  const announcementContent = document.getElementById(
    "announcement-content"
  ).value;

  if (!lat || !long) {
    alert("Please select a location on the map before updating.");
    return;
  }

  if (!announcementTitle || !announcementContent) {
    alert("Please fill in both the announcement title and content.");
    return;
  }

  try {
    // First, update all selected plant requests
    const updatePromises = requestIds.map((requestId) => {
      const requestRef = doc(db, "plant_requests", requestId);
      return updateDoc(requestRef, {
        plantingStatus: status,
        locationLat: lat.toString(),
        locationLong: long.toString(),
        timestamp: new Date(),
      });
    });

    await Promise.all(updatePromises);

    // Create the announcement with the correct data structure
    const announcementRef = collection(db, "announcements");
    await addDoc(announcementRef, {
      title: announcementTitle.toString(),
      content: announcementContent.toString(),
      imageUrl: "",
      // Set location as GeoPoint to match Flutter's expectations
      location: new GeoPoint(parseFloat(lat), parseFloat(long)),
      latitude: parseFloat(lat),
      longitude: parseFloat(long),
      timestamp: Timestamp.now(),
    });

    // Reset UI state
    selectedRequests.clear();
    closeModal();

    alert("Plant requests updated and announcement created successfully");

    // Reset pagination state and fetch fresh data
    currentPage = 1;
    lastVisible = null;
    firstVisible = null;
    await fetchPlantRequests();
  } catch (error) {
    console.error(
      "Error updating plant requests and creating announcement: ",
      error
    );
    alert("Failed to update plant requests and create announcement");
  }
}

// Clean up when closing the modal
function closeModal() {
  document.getElementById("update-modal").style.display = "none";
  currentPlantRequest = null;
  if (marker) {
    marker.remove();
    marker = null;
  }
}

async function updatePlantRequest(requestId) {
  const status = document.getElementById("status").value;
  const lat = document.getElementById("lat").value;
  const long = document.getElementById("long").value;

  if (!lat || !long) {
    alert("Please select a location on the map before updating.");
    return;
  }

  try {
    const requestRef = doc(db, "plant_requests", requestId);
    await updateDoc(requestRef, {
      plantingStatus: status,
      locationLat: lat.toString(),
      locationLong: long.toString(),
    });

    closeModal();
    alert("Plant request updated successfully");

    // Reset pagination state and fetch fresh data
    currentPage = 1;
    lastVisible = null;
    firstVisible = null;
    await fetchPlantRequests();
  } catch (error) {
    console.error("Error updating plant request: ", error);
    alert("Failed to update plant request");
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

// Update the modal close button event listener
document.querySelector(".close").onclick = closeModal;

document.addEventListener("DOMContentLoaded", () => {
  initializeFilters();
});