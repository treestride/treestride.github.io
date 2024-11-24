
      // Import Firebase modules
      import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
      import {
        getAuth,
        onAuthStateChanged,
        signOut,
      } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
      import {
        getFirestore,
        collection,
        onSnapshot,
        doc,
        updateDoc,
        deleteDoc,
        query,
        where,
        getDocs,
        writeBatch,
        orderBy,
        limit,
        Timestamp,
        getDoc
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
          }
        } else {
            window.location.href = "../index.html";
        }
      });

      // Pagination state
      const state = {
        postsPerPage: 10,
        currentPage: 1,
        lastVisible: null,
        totalPages: 1,
        allPosts: [],
      };

      // Load reported posts with pagination
      async function loadReportedPosts() {
        const tableBody = document.getElementById("table-body");

        try {
          const reportedPostsRef = collection(db, "reported_posts");
          const q = query(
            reportedPostsRef,
            orderBy("reportedAt", "desc"),
            limit(state.postsPerPage)
          );

          const unsubscribe = onSnapshot(q, (snapshot) => {
            state.allPosts = [];
            tableBody.innerHTML = "";

            snapshot.forEach((doc) => {
              const data = { ...doc.data(), id: doc.id };
              state.allPosts.push(data);
              const row = createTableRow(data);
              tableBody.appendChild(row);
            });

            if (snapshot.empty) {
              tableBody.innerHTML = `
                <tr>
                  <td colspan="6" style="text-align: center;">No reported posts found.</td>
                </tr>
              `;
            }

            // Update pagination
            if (snapshot.docs.length > 0) {
              state.lastVisible = snapshot.docs[snapshot.docs.length - 1];
            }
            updatePagination();
          });

          return unsubscribe;
        } catch (error) {
          console.error("Error loading posts: ", error);
          tableBody.innerHTML = `
            <tr>
              <td colspan="6" style="text-align: center;">Error loading posts. Please try again.</td>
            </tr>
          `;
        }
      }

      function createTableRow(data) {
        const row = document.createElement("tr");
        const reportDate =
          data.reportedAt instanceof Timestamp
            ? data.reportedAt.toDate()
            : new Date();

        row.innerHTML = `
          <td>
            <div class="user-info">
              ${
                data.posterPhotoURL
                  ? `
                <img src="${data.posterPhotoURL}" alt="Profile" class="user-avatar">
              `
                  : ""
              }
              <div>
                <div>${data.posterUsername || "Unknown User"}</div>
              </div>
            </div>
          </td>
          <td>${data.content || ""}</td>
          <td>
            ${
              data.imageUrl
                ? `
              <img src="${data.imageUrl}" alt="Post image" class="post-image-preview">
            `
                : "No image"
            }
          </td>
          <td>${data.reportedBy || "Anonymous"}</td>
          <td>${reportDate.toLocaleString()}</td>
          <td>
            <div class="button-group">
              <button class="dismiss-btn" onclick="window.handleDismissReport('${
                data.id
              }')">
                ✓ Dismiss
              </button>
              <button class="delete-btn" onclick="window.handleDeletePost('${
                data.postId
              }')">
                🗑️ Delete
              </button>
            </div>
          </td>
        `;

        return row;
      }

      async function loadNextPage() {
        if (!state.lastVisible) return;

        const reportedPostsRef = collection(db, "reported_posts");
        const q = query(
          reportedPostsRef,
          orderBy("reportedAt", "desc"),
          startAfter(state.lastVisible),
          limit(state.postsPerPage)
        );

        const snapshot = await getDocs(q);
        const tableBody = document.getElementById("table-body");
        tableBody.innerHTML = "";

        snapshot.forEach((doc) => {
          const data = { ...doc.data(), id: doc.id };
          const row = createTableRow(data);
          tableBody.appendChild(row);
        });

        if (snapshot.docs.length > 0) {
          state.lastVisible = snapshot.docs[snapshot.docs.length - 1];
          state.currentPage++;
          updatePagination();
        }
      }

      async function loadPrevPage() {
        if (state.currentPage <= 1) return;

        // Implementation for previous page would require keeping track of all document snapshots
        // This is a simplified version that reloads from the beginning
        state.currentPage--;
        await loadReportedPosts();
      }

      function updatePagination() {
        const paginationElement = document.getElementById("pagination");
        paginationElement.innerHTML = `
          <button onclick="window.handlePrevPage()" ${
            state.currentPage <= 1 ? "disabled" : ""
          }>
            Previous
          </button>
          <span>Page ${state.currentPage}</span>
          <button onclick="window.handleNextPage()" ${
            state.allPosts.length < state.postsPerPage ? "disabled" : ""
          }>
            Next
          </button>
        `;
      }

      // Add new function to dismiss report
      async function dismissReport(reportId) {
        try {
          // Get the report document reference
          const reportRef = doc(db, "reported_posts", reportId);

          // Delete only the report document
          await deleteDoc(reportRef);

          alert("Report has been dismissed successfully.");
        } catch (error) {
          console.error("Error dismissing report: ", error);
          alert("Error dismissing report. Please try again.");
        }
      }

      // Add handler for dismiss button
      window.handleDismissReport = (reportId) => {
        if (
          confirm(
            "Are you sure you want to dismiss this report? This will remove it from the reported posts list but keep the original post."
          )
        ) {
          dismissReport(reportId);
        }
      };

      // Delete post function remains the same
      async function deletePost(postId) {
        try {
          const postRef = doc(db, "posts", postId);
          await deleteDoc(postRef);
          await removeFromReportedPosts(postId);
          alert("Post has been deleted successfully.");
        } catch (error) {
          console.error("Error deleting post: ", error);
          alert("Error deleting post. Please try again.");
        }
      }

      // Remove from reported posts function remains the same
      async function removeFromReportedPosts(postId) {
        try {
          const q = query(
            collection(db, "reported_posts"),
            where("postId", "==", postId)
          );

          const querySnapshot = await getDocs(q);

          const batch = writeBatch(db);
          querySnapshot.forEach((doc) => {
            batch.delete(doc.ref);
          });

          await batch.commit();
        } catch (error) {
          console.error("Error removing from reported posts: ", error);
          alert("Error removing from reported posts. Please try again.");
        }
      }

      // Add handler for dismiss button
      window.handleDismissReport = (reportId) => {
        if (
          confirm(
            "Are you sure you want to dismiss this report? This will remove it from the reported posts list but keep the original post."
          )
        ) {
          dismissReport(reportId);
        }
      };

      window.handleDeletePost = (postId) => {
        if (
          confirm(
            "Are you sure you want to delete this post? This will permanently remove the post and cannot be undone."
          )
        ) {
          deletePost(postId);
        }
      };

      window.handleNextPage = loadNextPage;
      window.handlePrevPage = loadPrevPage;

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

      // Load posts when page loads
      document.addEventListener("DOMContentLoaded", loadReportedPosts);
    