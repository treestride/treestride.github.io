
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
        addDoc,
        getDocs,
        Timestamp,
        query,
        orderBy,
        limit,
        doc,
        getDoc,
        deleteDoc,
        updateDoc,
        startAfter,
        startAt,
        getCountFromServer,
      } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
      import {
        getStorage,
        ref,
        uploadBytes,
        getDownloadURL,
      } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

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
      const storage = getStorage(app);

      let currentPage = 1;
      const ANNOUNCEMENTS_PER_PAGE = 4;
      let lastVisible = null;
      let firstVisible = null;
      let totalPages = 0;
      let currentAnnouncementId = null;
      let map;
      let marker;

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
        showLoading();
        if (user) {
          const email = user.email;
          const userRoleDisplay = document.getElementById('user-role-display');
          
          // Allow admin full access
          if (email === "admin@gmail.com") {
            userRoleDisplay.textContent = "Admin";
            hideLoading();
            fetchAnnouncements("next");
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
            if (currentPage === 'announcements.html') {
              fetchAnnouncements("next");
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

      // Get modal elements
      const modal = document.getElementById("announcement-modal");
      const createAnnouncementBtn = document.getElementById(
        "create-announcement-btn"
      );

      const closeBtn = document.getElementsByClassName("close")[0];

      // Open modal
      createAnnouncementBtn.onclick = function () {
        modal.style.display = "block";
        resetForm();
        updateMapView();
      };

      // Close modal
      function closeModal() {
        modal.style.display = "none";
        resetForm();
      }

      // Close modal when clicking outside
      closeBtn.onclick = closeModal;

      window.onclick = function (event) {
        if (event.target == modal) {
          closeModal();
        }
      };

      // Initialize map once when the page loads
      document.addEventListener("DOMContentLoaded", () => {
        map = L.map("map").setView([0, 0], 2);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
        }).addTo(map);

        map.on("click", function (e) {
          if (marker) {
            map.removeLayer(marker);
          }
          marker = L.marker(e.latlng).addTo(map);
          document.getElementById("location").value = JSON.stringify(e.latlng);
        });
      });

      // Function to update map view
      function updateMapView(lat, lng) {
        if (lat && lng) {
          map.setView([lat, lng], 13);
          if (marker) map.removeLayer(marker);
          marker = L.marker([lat, lng]).addTo(map);
          document.getElementById("location").value = JSON.stringify({
            lat,
            lng,
          });
        } else if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            function (position) {
              const lat = position.coords.latitude;
              const lng = position.coords.longitude;
              map.setView([lat, lng], 13);
              if (marker) map.removeLayer(marker);
              marker = L.marker([lat, lng]).addTo(map);
              document.getElementById("location").value = JSON.stringify({
                lat,
                lng,
              });
            },
            function (error) {
              console.error("Error getting location:", error.message);
            }
          );
        } else {
          console.log("Geolocation is not supported by this browser.");
        }
      }

      // Get the location sharing checkbox
      const locationSharingCheckbox =
        document.getElementById("location-sharing");

      // Toggle map visibility based on the checkbox
      locationSharingCheckbox.addEventListener("change", function () {
        const mapContainer = document.getElementById("map");
        if (this.checked) {
          mapContainer.style.display = "block";
          setTimeout(() => {
            map.invalidateSize();
            const locationValue = document.getElementById("location").value;
            if (locationValue) {
              const { lat, lng } = JSON.parse(locationValue);
              updateMapView(lat, lng);
            } else {
              updateMapView();
            }
          }, 100);
        } else {
          mapContainer.style.display = "none";
          if (marker) {
            map.removeLayer(marker);
          }
          document.getElementById("location").value = "";
        }
      });

      // Submission handling
      document
        .getElementById("announcement-form")
        .addEventListener("submit", async (e) => {
          e.preventDefault();
          const title = document.getElementById("title").value;
          const content = document.getElementById("content").value;
          const imageFile = document.getElementById("image").files[0];
          const locationString = document.getElementById("location").value;

          // Check if location sharing is enabled
          const shareLocation = locationSharingCheckbox.checked;

          let locationData = null;
          let latitude = null;
          let longitude = null;

          if (shareLocation && locationString) {
            locationData = JSON.parse(locationString);
            latitude = locationData.lat;
            longitude = locationData.lng;
          }

          try {
            let imageUrl = "";
            if (imageFile) {
              const storageRef = ref(
                storage,
                "announcement_images/" + Date.now() + "_" + imageFile.name
              );
              await uploadBytes(storageRef, imageFile);
              imageUrl = await getDownloadURL(storageRef);
            }

            if (currentAnnouncementId) {
              // Update existing announcement
              await updateDoc(doc(db, "announcements", currentAnnouncementId), {
                title,
                content,
                ...(imageUrl && { imageUrl }),
                ...(locationData && { location: locationData }),
                ...(latitude && { latitude }), // Save latitude if available
                ...(longitude && { longitude }), // Save longitude if available
                timestamp: Timestamp.now(),
              });
              alert("Announcement updated successfully!");
            } else {
              // Create new announcement
              await addDoc(collection(db, "announcements"), {
                title,
                content,
                imageUrl,
                ...(locationData && { location: locationData }),
                ...(latitude && { latitude }), // Save latitude if available
                ...(longitude && { longitude }), // Save longitude if available
                timestamp: Timestamp.now(),
              });
              alert("Announcement posted successfully!");
            }

            modal.style.display = "none";
            resetForm();
            currentPage = 1; // Reset to the first page
            lastVisible = null; // Reset the last visible document
            firstVisible = null; // Reset the first visible document
            fetchAnnouncements("next");
          } catch (error) {
            console.error("Error posting/updating announcement: ", error);
            alert("Failed to post/update announcement.");
          }
        });

      async function checkAndDisplayEmptyState() {
        const announcementsDiv = document.getElementById("announcements");
        const paginationDiv = document.querySelector(".pagination");

        const countSnapshot = await getCountFromServer(
          collection(db, "announcements")
        );
        const totalAnnouncements = countSnapshot.data().count;

        if (totalAnnouncements === 0) {
          announcementsDiv.innerHTML = `
      <h2>Current Announcements</h2>
      <div style="text-align: center; padding: 40px 20px; background: #f9f9f9; border-radius: 8px; margin-top: 20px;">
        <i class="fa-regular fa-newspaper" style="font-size: 48px; color: #999; margin-bottom: 16px;"></i>
        <h3 style="color: #666; margin-bottom: 8px;">No Announcements Yet</h3>
        <p style="color: #888;">Create your first announcement by clicking the button above.</p>
      </div>
    `;
          paginationDiv.style.display = "none";
          return true;
        }
        return false;
      }

      // Fetch and display announcements
      async function fetchAnnouncements(direction = "next") {
        const announcementsDiv = document.getElementById("announcements");

        // First get the total count
        const countSnapshot = await getCountFromServer(
          collection(db, "announcements")
        );
        const totalAnnouncements = countSnapshot.data().count;

        // If there are no announcements, show the empty state
        if (totalAnnouncements === 0) {
          announcementsDiv.innerHTML = `
      <h2>Current Announcements</h2>
      <div style="text-align: center; padding: 40px 20px; background: #f9f9f9; border-radius: 8px; margin-top: 20px;">
        <i class="fa-regular fa-newspaper" style="font-size: 48px; color: #999; margin-bottom: 16px;"></i>
        <h3 style="color: #666; margin-bottom: 8px;">No Announcements Yet</h3>
        <p style="color: #888;">Create your first announcement by clicking the button above.</p>
      </div>
    `;
          // Hide pagination when there's no data
          document.querySelector(".pagination").style.display = "none";
          return;
        }

        // Show pagination if there's data
        document.querySelector(".pagination").style.display = "flex";
        announcementsDiv.innerHTML = "<h2>Current Announcements</h2>";

        let q = query(
          collection(db, "announcements"),
          orderBy("timestamp", "desc"),
          limit(ANNOUNCEMENTS_PER_PAGE)
        );

        if (direction === "next" && lastVisible) {
          q = query(
            collection(db, "announcements"),
            orderBy("timestamp", "desc"),
            startAfter(lastVisible),
            limit(ANNOUNCEMENTS_PER_PAGE)
          );
        } else if (direction === "prev" && firstVisible) {
          q = query(
            collection(db, "announcements"),
            orderBy("timestamp", "desc"),
            endBefore(firstVisible),
            limitToLast(ANNOUNCEMENTS_PER_PAGE)
          );
        }

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty && direction !== "next") {
          // Handle case where we've paginated too far
          currentPage--;
          fetchAnnouncements("next");
          return;
        }

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const announcementElement = createAnnouncementElement(doc.id, data);
          announcementsDiv.appendChild(announcementElement);
        });

        lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
        firstVisible = querySnapshot.docs[0];

        updatePagination();
      }

      async function updatePagination() {
        const countSnapshot = await getCountFromServer(
          collection(db, "announcements")
        );
        const totalAnnouncements = countSnapshot.data().count;

        totalPages = Math.ceil(totalAnnouncements / ANNOUNCEMENTS_PER_PAGE);
        const prevButton = document.getElementById("prev-page");
        const nextButton = document.getElementById("next-page");
        const pageInfo = document.getElementById("page-info");

        prevButton.disabled = currentPage === 1;
        nextButton.disabled = currentPage === totalPages;
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
      }

      // Add event listeners for pagination buttons
      document.getElementById("prev-page").addEventListener("click", () => {
        if (currentPage > 1) {
          currentPage--;
          fetchAnnouncements("prev");
        }
      });

      document.getElementById("next-page").addEventListener("click", () => {
        if (currentPage < totalPages) {
          currentPage++;
          fetchAnnouncements("next");
        }
      });

      function createAnnouncementElement(id, data) {
        const announcementElement = document.createElement("div");
        announcementElement.className = "announcement";
        announcementElement.id = `announcement-${id}`;
    
        let locationHtml = "";
        // Only add map container if location data exists
        if (data.location && data.latitude && data.longitude) {
            const mapId = `map-${id}`;
            locationHtml = `
                <div id="${mapId}" class="announcement-map"></div>
                <p style='display:none;'>Latitude: ${data.latitude}, Longitude: ${data.longitude}</p>
            `;
        }
    
        announcementElement.innerHTML = `
            <div class="action-buttons">
                <button class="edit-btn" onclick="editAnnouncement('${id}')">Edit</button>
                <button class="delete-btn" onclick="deleteAnnouncement('${id}')">Delete</button>
            </div>
            <h3>${data.title}</h3>
            <p>${data.content}</p>
            ${data.imageUrl ? `<img src="${data.imageUrl}" alt="Announcement image">` : ""}
            ${locationHtml}
            <p style="margin-top:0.5rem">Posted on: ${data.timestamp.toDate().toLocaleString()}</p>
        `;
    
        // Only initialize map if location data exists
        if (data.location && data.latitude && data.longitude) {
            // Use setTimeout to ensure DOM is ready
            setTimeout(() => {
                const mapElement = document.getElementById(`map-${id}`);
                if (mapElement) {
                    try {
                        const announcementMap = L.map(`map-${id}`);
                        announcementMap.setView([data.latitude, data.longitude], 13);
    
                        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                            attribution: "© OpenStreetMap contributors"
                        }).addTo(announcementMap);
    
                        L.marker([data.latitude, data.longitude]).addTo(announcementMap);
                    } catch (error) {
                        console.error(`Error initializing map for announcement ${id}:`, error);
                        // Remove map container if initialization fails
                        mapElement.remove();
                    }
                }
            }, 100); // Small delay to ensure DOM is ready
        }
    
        return announcementElement;
    }

      // Edit announcement function
      window.editAnnouncement = async (id) => {
        const docRef = doc(db, "announcements", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          document.getElementById("title").value = data.title;
          document.getElementById("content").value = data.content;

          currentAnnouncementId = id;
          document.getElementById("modal-title").textContent =
            "Edit Announcement";
          document.getElementById("submit-announcement").textContent =
            "Update Announcement";
          modal.style.display = "block";

          // Handle location data
          if (data.location) {
            document.getElementById("location-sharing").checked = true;
            document.getElementById("map").style.display = "block";
            document.getElementById("location").value = JSON.stringify(
              data.location
            );

            // Use setTimeout to ensure the map container is visible before updating
            setTimeout(() => {
              map.invalidateSize();
              map.setView([data.location.lat, data.location.lng], 13);
              if (marker) map.removeLayer(marker);
              marker = L.marker([data.location.lat, data.location.lng]).addTo(
                map
              );
            }, 100);
          } else {
            resetMapAndCheckbox();
          }

          // Handle image preview if needed
          //TODO: Add code here to display the existing image if there is one
        } else {
          console.log("No such document!");
        }
      };

      // Delete announcement function
      window.deleteAnnouncement = async (id) => {
        if (confirm("Are you sure you want to delete this announcement?")) {
          try {
            await deleteDoc(doc(db, "announcements", id));

            // Check if this was the last announcement
            const isEmpty = await checkAndDisplayEmptyState();
            if (!isEmpty) {
              // If there are still announcements, refresh the current page
              currentPage = 1;
              lastVisible = null;
              firstVisible = null;
              await fetchAnnouncements("next");
            }
          } catch (error) {
            console.error("Error deleting announcement: ", error);
            alert("Failed to delete announcement.");
          }
        }
      };

      // Reset form function
      function resetForm() {
        document.getElementById("announcement-form").reset();
        currentAnnouncementId = null;
        document.getElementById("modal-title").textContent =
          "Create New Announcement";
        document.getElementById("submit-announcement").textContent =
          "Post Announcement";
        resetMapAndCheckbox();
        updateMapView(); // Update map view to user's location
      }

      function resetMapAndCheckbox() {
        const mapContainer = document.getElementById("map");
        const locationSharingCheckbox =
          document.getElementById("location-sharing");

        mapContainer.style.display = "none";
        locationSharingCheckbox.checked = false;

        if (marker) {
          map.removeLayer(marker);
        }
        document.getElementById("location").value = "";
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