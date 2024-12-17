
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
        addDoc,
        collection,
        getDoc,
        query,
        where,
        getDocs,
        updateDoc,
        serverTimestamp,
        orderBy,
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

      async function loadTreeOptions() {
        const treeRef = collection(db, "tree_inventory");
        const treeSnapshot = await getDocs(treeRef);

        const treeSelect = document.getElementById("tree");

        treeSnapshot.forEach((doc) => {
          const tree = doc.data();
          const option = document.createElement("option");
          option.value = JSON.stringify({
            id: doc.id,
            name: tree.name,
            stocks: tree.stocks,
            image: tree.image,
            type: tree.type,
          });
          option.textContent = `${tree.name} (Stocks: ${tree.stocks}, Type: ${tree.type})`;
          treeSelect.appendChild(option);
        });
      }

      async function loadGroupMissions() {
        const missionsRef = query(
          collection(db, "group_missions"),
          orderBy("timestamp", "desc")
        );
        const missionsSnapshot = await getDocs(missionsRef);

        const tableBody = document.querySelector("#groupMissionsTable tbody");
        tableBody.innerHTML = "";

        missionsSnapshot.forEach((doc) => {
          const mission = doc.data();
          const row = document.createElement("tr");

          row.innerHTML = `
    <td>${mission.goal}</td>
    <td>${mission.participants}</td>
    <td>
        ${mission.treeName} 
        <br><small>(Type: ${mission.treeType})</small>
        ${
          mission.treeImage
            ? `<br><img src="${mission.treeImage}" style="max-width: 100px; max-height: 100px;">`
            : ""
        }
    </td>
    <td data-status="${mission.status}">${mission.status}</td>
`;

          tableBody.appendChild(row);
        });
      }

      document
        .getElementById("groupMissionForm")
        .addEventListener("submit", async (e) => {
          e.preventDefault();

          const goal = parseInt(document.getElementById("goal").value, 10);
          const participants = parseInt(
            document.getElementById("participants").value,
            10
          );
          const treeData = JSON.parse(document.getElementById("tree").value);
          const status = document.getElementById("status").value;

          if (participants > treeData.stocks) {
            alert("Not enough stock available for the selected tree.");
            return;
          }

          const groupMission = {
            goal,
            participants,
            participantsJoined: [],
            treeName: treeData.name,
            treeImage: treeData.image,
            treeType: treeData.type,
            status: status,
            timestamp: serverTimestamp(),
          };

          try {
            // Add group mission to Firestore
            await addDoc(collection(db, "group_missions"), groupMission);

            // Deduct tree stock
            const treeRef = doc(db, "tree_inventory", treeData.id);
            await updateDoc(treeRef, {
              stocks: treeData.stocks - participants,
            });

            // Log the stock deduction in stock_entries
            await addDoc(collection(db, "stock_entries"), {
              treeId: treeData.id,
              treeName: treeData.name,
              treeImage: treeData.image,
              treeType: treeData.type,
              quantity: participants,
              operation: "allotted",
              notes: `Allocated for group mission`,
              timestamp: serverTimestamp(),
            });

            alert("Group mission added successfully.");
            e.target.reset();
            loadGroupMissions();
          } catch (error) {
            console.error("Error adding group mission:", error);
            alert("Failed to add group mission. Please try again.");
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

      loadTreeOptions();
      loadGroupMissions();