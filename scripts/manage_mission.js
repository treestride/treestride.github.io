
      import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
      import {
        getFirestore,
        doc,
        getDoc,
        setDoc,
        collection,
        query,
        where,
        getDocs,
        orderBy,
        limit,
        startAfter,
        endBefore,
        limitToLast,
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

      let usersData = [];
      let completedUsers = [];
      let lastVisible = null;
      let firstVisible = null;
      let currentPage = 1;
      let requiredSteps = 0;
      const usersPerPage = 10;

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

      const missionDocRef = doc(db, "mission", "currentMission");

      async function loadMission() {
        try {
          const missionDoc = await getDoc(missionDocRef);
          if (missionDoc.exists()) {
            const data = missionDoc.data();
            requiredSteps = parseInt(data.steps);
            const endDate = new Date(data.endDate);

            document.getElementById("displaySteps").textContent = data.steps;
            document.getElementById("displayReward").textContent = data.reward;
            document.getElementById("displayEndDate").textContent =
              formatDate(endDate);

            // Pre-fill form
            document.getElementById("steps").value = data.steps;
            document.getElementById("reward").value = data.reward;

            // Set the minimum date to either tomorrow or the day after current mission end date
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dayAfterMissionEnd = new Date(endDate);
            dayAfterMissionEnd.setDate(dayAfterMissionEnd.getDate() + 1);

            // Use the later date between tomorrow and day after mission end
            const minDate =
              tomorrow > dayAfterMissionEnd ? tomorrow : dayAfterMissionEnd;

            const dateInput = document.getElementById("endDate");
            dateInput.min = formatForInput(minDate);
            dateInput.value = formatForInput(minDate); // Set default value to minimum allowed date

            // Load users after getting required steps
            await loadUserProgress();
          }
        } catch (error) {
          console.error("Error loading mission: ", error);
        }
      }

      // Load mission on page load
      window.onload = function () {
        loadMission();
        loadUserProgress();
      };

      function setMinEndDate() {
        const today = new Date().toISOString().split("T")[0];
        document.getElementById("endDate").setAttribute("min", today);
      }

      // Load User Progress with sorting and pagination
      async function loadUserProgress(direction) {
        try {
          const usersColRef = collection(db, "users");
          let q;

          // Modified base query - removed the where clause initially to check if any users exist
          if (direction === "next" && lastVisible) {
            q = query(
              usersColRef,
              orderBy("missionSteps", "desc"),
              startAfter(lastVisible),
              limit(usersPerPage)
            );
          } else if (direction === "prev" && firstVisible) {
            q = query(
              usersColRef,
              orderBy("missionSteps", "desc"),
              endBefore(firstVisible),
              limitToLast(usersPerPage)
            );
          } else {
            q = query(
              usersColRef,
              orderBy("missionSteps", "desc"),
              limit(usersPerPage)
            );
          }

          const querySnapshot = await getDocs(q);
          console.log("Number of users found:", querySnapshot.size); // Debug log

          if (!querySnapshot.empty) {
            lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
            firstVisible = querySnapshot.docs[0];

            const allUsers = querySnapshot.docs.map((doc) => {
              const data = doc.data();
              console.log("User data:", data); // Debug log
              return {
                ...data,
                id: doc.id,
                // Convert to number to ensure proper comparisons
                missionSteps: Number(data.missionSteps || 0),
                missionsCompleted: Number(data.missionsCompleted || 0),
              };
            });

            separateUsers(allUsers);
          } else {
            console.log("No users found in query"); // Debug log
            usersData = [];
            completedUsers = [];
          }

          displayUsers();
          displayCompletedUsers();
          updatePaginationButtons();
        } catch (error) {
          console.error("Error loading user progress: ", error);
        }
      }
      // Display users for the current page
      function separateUsers(allUsers) {
        usersData = [];
        completedUsers = [];

        allUsers.forEach((user) => {
          if (user.missionSteps >= requiredSteps) {
            completedUsers.push(user);
          } else if (user.missionSteps > 0) {
            usersData.push(user);
          }
        });
      }

      // displayUsers function
      function displayUsers() {
        const userProgressContainer = document.getElementById("userProgress");
        if (!userProgressContainer) {
          console.error("User progress container not found");
          return;
        }

        userProgressContainer.innerHTML = "";

        if (usersData.length === 0) {
          userProgressContainer.innerHTML = `
      <tr class="no-data">
        <td colspan="4">No users in progress</td>
      </tr>`;
          return;
        }

        usersData.forEach((user) => {
          const progress = (
            (Number(user.missionSteps) / Number(requiredSteps)) *
            100
          ).toFixed(1);
          const row = document.createElement("tr");
          row.innerHTML = `
      <td>${user.username || "Unknown"}</td>
      <td>${user.missionSteps || 0}</td>
      <td>${progress}%</td>
      <td>${user.missionsCompleted || 0}</td>
    `;
          userProgressContainer.appendChild(row);
        });
      }

      // New function to display completed users
      function displayCompletedUsers() {
        const completedContainer = document.getElementById("completedProgress");
        if (!completedContainer) {
          console.error("Completed progress container not found");
          return;
        }

        completedContainer.innerHTML = "";

        if (completedUsers.length === 0) {
          completedContainer.innerHTML = `
      <tr class="no-data">
        <td colspan="3">No user has completed the mission yet</td>
      </tr>`;
          return;
        }

        completedUsers.forEach((user) => {
          const row = document.createElement("tr");
          row.innerHTML = `
      <td>${user.username || "Unknown"}</td>
      <td>${user.missionSteps || 0}</td>
      <td>${user.missionsCompleted || 0}</td>
    `;
          completedContainer.appendChild(row);
        });
      }

      // Update the state of pagination buttons
      function updatePaginationButtons() {
        document.getElementById("prevPage").disabled = currentPage === 1;
        document.getElementById("nextPage").disabled =
          usersData.length < usersPerPage;
        document.getElementById(
          "pageDisplay"
        ).textContent = `Page ${currentPage}`;
      }

      // Pagination event listeners
      document.getElementById("prevPage").addEventListener("click", () => {
        if (currentPage > 1) {
          currentPage--;
          loadUserProgress("prev");
        }
      });

      document.getElementById("nextPage").addEventListener("click", () => {
        if (usersData.length === usersPerPage) {
          currentPage++;
          loadUserProgress("next");
        }
      });

      const modal = document.getElementById("missionModal");
      const btn = document.getElementById("updateMission");
      const span = document.getElementsByClassName("close")[0];

      document
        .getElementById("saveMission")
        .addEventListener("click", async function () {
          const steps = document.getElementById("steps").value;
          const reward = document.getElementById("reward").value;
          const endDateValue = document.getElementById("endDate").value;

          // Save the date in ISO 8601 format
          const endDate = new Date(endDateValue).toISOString();

          try {
            await setDoc(missionDocRef, {
              steps: steps,
              reward: reward,
              endDate: endDate,
            });
            console.log("Mission saved successfully!");
            alert("Mission saved successfully!");
            document.getElementById("displaySteps").textContent = steps;
            document.getElementById("displayReward").textContent = reward;
            document.getElementById("displayEndDate").textContent = formatDate(
              new Date(endDate)
            );

            closeModal();
          } catch (error) {
            console.error("Error saving mission: ", error);
            alert("Error saving mission!");
          }
        });

      function openModal() {
        modal.style.display = "flex";
      }

      function closeModal() {
        modal.style.display = "none";
      }

      btn.onclick = function () {
        openModal();
      };

      span.onclick = function () {
        closeModal();
      };

      window.onclick = function (event) {
        if (event.target == modal) {
          closeModal();
        }
      };

      // Format date functions
      function formatDate(date) {
        const options = { month: "long" };
        const month = date.toLocaleString("en-US", options);
        const day = date.getDate();
        const year = date.getFullYear();
        return `${month} ${day}, ${year}`;
      }

      function formatForInput(date) {
        return date.toISOString().split("T")[0];
      }

      async function initializePage() {
        try {
          await loadMission(); // Load mission data first
          await loadUserProgress(); // Then load user data
        } catch (error) {
          console.error("Error initializing page:", error);
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

      // Initialize the page
      window.onload = initializePage;
    