
      import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
      import {
        getAuth,
        onAuthStateChanged,
        signOut,
      } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
      import {
        getFirestore,
        doc,
        setDoc,
        getDoc,
        addDoc,
        collection,
        query,
        orderBy,
        getDocs,
        deleteDoc,
        limit,
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

      const activeMissionRef = doc(db, "mission", "currentMission");
      const missionQueueRef = collection(db, "missionQueue");

      async function loadActiveMission() {
        const docSnap = await getDoc(activeMissionRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          document.getElementById("activeSteps").textContent = data.steps;
          document.getElementById("activeReward").textContent = data.reward;
          document.getElementById("activeEndDate").textContent = new Date(
            data.endDate
          ).toLocaleDateString();

          // Check if mission has ended
          await checkMissionEnd(data.endDate);
        } else {
          document.getElementById("activeMission").textContent =
            "No active mission.";
          // Try to load next mission from queue
          await loadNextMissionFromQueue();
        }
      }

      async function loadNextMissionFromQueue() {
        const q = query(missionQueueRef, orderBy("endDate"), limit(1));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const nextMissionDoc = querySnapshot.docs[0];
          const nextMissionData = nextMissionDoc.data();

          await setDoc(activeMissionRef, nextMissionData);
          await deleteDoc(nextMissionDoc.ref);

          loadActiveMission();
          loadMissionQueue();
        }
      }

      async function checkMissionEnd(endDate) {
        const now = new Date();
        const missionEnd = new Date(endDate);

        if (missionEnd <= now) {
          await loadNextMissionFromQueue();
        }
      }

      async function isDateOverlapping(newStartDate, newEndDate) {
        // Check if the new mission's end date is before or equal to the latest mission's end date
        const q = query(missionQueueRef, orderBy("endDate", "desc"), limit(1));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const latestMission = querySnapshot.docs[0].data();
          const latestMissionEndDate = new Date(latestMission.endDate);
          const newEndDateObj = new Date(newEndDate);

          if (newEndDateObj <= latestMissionEndDate) {
            return true; // Overlapping or before the last mission's end date
          }
        }

        // Also check the active mission if it exists
        const activeMissionSnap = await getDoc(activeMissionRef);
        if (activeMissionSnap.exists()) {
          const activeMission = activeMissionSnap.data();
          const activeEndDate = new Date(activeMission.endDate);

          if (new Date(newEndDate) <= activeEndDate) {
            return true; // Overlapping or before the active mission's end date
          }
        }

        return false;
      }

      async function addMissionToQueue(steps, reward, endDate) {
        // Get today's date as the start date
        const startDate = new Date().toISOString().split("T")[0];

        // Check for date overlap
        const isOverlapping = await isDateOverlapping(startDate, endDate);

        if (isOverlapping) {
          return false;
        }

        await addDoc(missionQueueRef, {
          steps,
          reward,
          endDate,
          startDate,
        });

        loadMissionQueue();
        return true;
      }

      async function loadMissionQueue() {
        const q = query(missionQueueRef, orderBy("endDate"));
        const querySnapshot = await getDocs(q);

        const queueList = document.getElementById("missionQueue");
        queueList.innerHTML = "";

        if (querySnapshot.empty) {
          queueList.innerHTML = "<li>No missions in queue.</li>";
          return;
        }

        querySnapshot.forEach((doc) => {
          const mission = doc.data();
          const listItem = document.createElement("li");
          listItem.textContent = `Steps: ${mission.steps}, Reward: ${
            mission.reward
          }, End Date: ${new Date(mission.endDate).toLocaleDateString()}`;

          // Add button to make this mission active
          const makeActiveButton = document.createElement("button");
          makeActiveButton.textContent = "Make Active";
          makeActiveButton.addEventListener("click", async () => {
            await setDoc(activeMissionRef, mission);
            await deleteDoc(doc.ref);
            loadActiveMission();
            loadMissionQueue();
            alert("Mission is now active.");
          });

          listItem.appendChild(makeActiveButton);
          queueList.appendChild(listItem);
        });
      }

      document
        .getElementById("addMissionForm")
        .addEventListener("submit", async (e) => {
          e.preventDefault();
          const steps = document.getElementById("steps").value;
          const reward = document.getElementById("reward").value;
          const endDate = document.getElementById("endDate").value;

          const added = await addMissionToQueue(steps, reward, endDate);
          if (added) {
            alert("Mission added to queue.");
            e.target.reset();
          } else {
            alert(
              "The mission end date must be after all existing missions' end dates."
            );
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

      // Initial load
      loadActiveMission();
      loadMissionQueue();

      // Periodically check for mission end (every 5 minutes)
      setInterval(loadActiveMission, 5 * 60 * 1000);