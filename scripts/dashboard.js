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
  getDocs,
  getDoc,
  doc
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
      fetchData();
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
      if (currentPage === 'dashboard.html') {
        fetchData();
      }

    } catch (error) {
      console.error("Error checking permissions:", error);
      window.location.href = "../index.html";
    }
  } else {
      window.location.href = "../index.html";
  }
});

// Declare chart variables globally
let treesChart = null;
let speciesChart = null;

async function fetchData() {
  try {
    const db = getFirestore();
    const usersSnapshot = await getDocs(collection(db, "users"));
    const plantingRequestsSnapshot = await getDocs(
      collection(db, "plant_requests")
    );
    const treeInventorySnapshot = await getDocs(
      collection(db, "tree_inventory")
    );

    // Process planting requests data
    const plantingData = plantingRequestsSnapshot.docs.map((doc) => ({
      timestamp: doc.data().timestamp?.toDate() || new Date(),
      status: doc.data().plantingStatus,
    }));

    // Process tree species data
    const speciesCount = {};

    // Count mature trees stocks
    treeInventorySnapshot.docs.forEach((doc) => {
      const tree = doc.data();
      // Access the stocks field directly as a number
      const stockAmount = parseInt(tree.stocks) || 0;
      speciesCount[tree.name] = (speciesCount[tree.name] || 0) + stockAmount;
    });

    // Total species count (unique species)
    const totalSpecies = Object.keys(speciesCount).length;
    // Convert species data for chart
    const speciesLabels = Object.keys(speciesCount);
    const speciesData = Object.values(speciesCount);

    // Generate colors for each species
    const speciesColors = speciesLabels.map((_, index) => {
      const hue = (index * 137.508) % 360; // Golden angle approximation
      return `hsl(${hue}, 70%, 50%)`;
    });

    // Destroy existing species chart if it exists
    if (speciesChart) {
      speciesChart.destroy();
    }

    // Create species distribution pie chart
    const speciesCtx = document
      .getElementById("species-chart")
      .getContext("2d");
    speciesChart = new Chart(speciesCtx, {
      type: "pie",
      data: {
        labels: speciesLabels,
        datasets: [
          {
            data: speciesData,
            backgroundColor: speciesColors,
            borderColor: "white",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: 12,
              padding: 10,
            },
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const total = context.dataset.data.reduce(
                  (a, b) => a + b,
                  0
                );
                const percentage = ((context.raw / total) * 100).toFixed(
                  1
                );
                return `${context.label}: ${context.raw} (${percentage}%)`;
              },
            },
          },
        },
      },
    });

    const totalTrees = plantingData.filter(
      (plant) => plant.status === "approved"
    ).length;

    // Update stats cards
    document.getElementById("total-trees").textContent =
      totalTrees.toLocaleString();
    document.getElementById("total-species").textContent =
      totalSpecies.toLocaleString();

    // Initialize with monthly data
    updateTreesPlantedChart(plantingData, "monthly");

    // Add event listener for time period changes
    const timePeriodSelect = document.getElementById("timePeriod");
    // Remove existing listener if any
    const newTimePeriodSelect = timePeriodSelect.cloneNode(true);
    timePeriodSelect.parentNode.replaceChild(newTimePeriodSelect, timePeriodSelect);
    newTimePeriodSelect.addEventListener("change", (e) => {
      updateTreesPlantedChart(plantingData, e.target.value);
    });

    // Add report button
    addReportButton();

  } catch (error) {
    console.error("Error fetching data: ", error);
    alert("Error loading report data");
  }
}

function updateTreesPlantedChart(plantingData, periodType) {
  const approvedPlantings = plantingData.filter(
    (plant) => plant.status === "approved"
  );
  let chartData;

  switch (periodType) {
    case "yearly":
      chartData = processYearlyData(approvedPlantings);
      break;
    case "quarterly":
      chartData = processQuarterlyData(approvedPlantings);
      break;
    default:
      chartData = processMonthlyData(approvedPlantings);
  }

  // Update total trees count
  const totalTrees = approvedPlantings.length;
  document.getElementById("total-trees").textContent =
    totalTrees.toLocaleString();

  // Destroy existing chart if it exists
  if (treesChart) {
    treesChart.destroy();
  }

  // Create new chart
  const treesCtx = document
    .getElementById("trees-chart")
    .getContext("2d");

  treesChart = new Chart(treesCtx, {
    type: "bar",
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: "Trees Planted",
          data: chartData.values,
          backgroundColor: "#38a169",
          borderColor: "#2f855a",
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.7,
          categoryPercentage: 0.8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return `Trees Planted: ${context.raw}`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
          },
          grid: {
            drawBorder: false,
          },
        },
        x: {
          grid: {
            display: false,
          },
        },
      },
    },
  });
}

function processYearlyData(plantings) {
  const yearlyData = {};
  plantings.forEach((plant) => {
    const year = plant.timestamp.getFullYear();
    yearlyData[year] = (yearlyData[year] || 0) + 1;
  });

  const years = Object.keys(yearlyData).sort();
  return {
    labels: years,
    values: years.map((year) => yearlyData[year]),
  };
}

function processQuarterlyData(plantings) {
  const quarterlyData = {};
  plantings.forEach((plant) => {
    const year = plant.timestamp.getFullYear();
    const quarter = Math.floor(plant.timestamp.getMonth() / 3) + 1;
    const key = `${year} Q${quarter}`;
    quarterlyData[key] = (quarterlyData[key] || 0) + 1;
  });

  const quarters = Object.keys(quarterlyData).sort();
  return {
    labels: quarters,
    values: quarters.map((quarter) => quarterlyData[quarter]),
  };
}

function processMonthlyData(plantings) {
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const last6Months = [];

  for (let i = 5; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const monthKey = date.toISOString().slice(0, 7);
    const monthLabel = monthNames[date.getMonth()];
    last6Months.push({ key: monthKey, label: monthLabel });
  }

  const monthlyData = {};
  plantings.forEach((plant) => {
    const monthKey = plant.timestamp.toISOString().slice(0, 7);
    monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
  });

  return {
    labels: last6Months.map((m) => m.label),
    values: last6Months.map((m) => monthlyData[m.key] || 0),
  };
}

// Function to generate and download the report
async function generateReport() {
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.width;
    const pageHeight = pdf.internal.pageSize.height;
    const margin = 20;

    // Color Palette
    const colors = {
      primary: [56, 161, 105],     // Green
      secondary: [41, 128, 185],    // Blue
      text: [0, 0, 0],              // Black
      background: [240, 242, 245]   // Light Gray
    };

    // Custom Font Setup (ensure these fonts are loaded)
    pdf.setFont('Helvetica', 'normal');

    // Background
    pdf.setFillColor(...colors.background);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');

    // Add Header with Logo
    const denrLogoUrl = '../denr_logo.png';
    pdf.addImage(denrLogoUrl, 'PNG', margin, margin, 30, 30);

    // Title with Modern Typography
    pdf.setTextColor(...colors.primary);
    pdf.setFontSize(24);
    pdf.setFont('Helvetica', 'bold');
    pdf.text('TreeStride Report', pageWidth/2, margin + 20, { 
      align: 'center',
      renderingMode: 'fill'
    });

    // Subtitle
    pdf.setFontSize(12);
    pdf.setTextColor(...colors.secondary);
    pdf.setFont('Helvetica', 'normal');
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    pdf.text(`Generated on: ${date}`, pageWidth/2, margin + 30, { align: 'center' });

    // Horizontal Line
    pdf.setLineWidth(0.5);
    pdf.setDrawColor(...colors.primary);
    pdf.line(margin, margin + 40, pageWidth - margin, margin + 40);

    // Key Statistics Section
    const totalTrees = document.getElementById('total-trees').textContent;
    const totalSpecies = document.getElementById('total-species').textContent;
    
    pdf.setFontSize(16);
    pdf.setTextColor(...colors.text);
    pdf.setFont('Helvetica', 'bold');
    pdf.text('Executive Summary', margin, margin + 60);

    pdf.setFontSize(12);
    pdf.setFont('Helvetica', 'normal');
    pdf.setTextColor(...colors.text);
    pdf.text(`Total Trees Planted:`, margin, margin + 70);
    pdf.setFont('Helvetica', 'bold');
    pdf.text(totalTrees, margin + 50, margin + 70);

    pdf.setFont('Helvetica', 'normal');
    pdf.text(`Total Tree Species:`, margin, margin + 80);
    pdf.setFont('Helvetica', 'bold');
    pdf.text(totalSpecies, margin + 50, margin + 80);

    // Fetch and process tree inventory
    const db = getFirestore();
    const treeInventorySnapshot = await getDocs(collection(db, "tree_inventory"));
    
    const speciesStocks = {};
    treeInventorySnapshot.docs.forEach((doc) => {
      const tree = doc.data();
      const stockAmount = parseInt(tree.stocks) || 0;
      speciesStocks[tree.name] = stockAmount;
    });

    // Species Stocks Section
    pdf.setFontSize(16);
    pdf.setFont('Helvetica', 'bold');
    pdf.text('Tree Species Inventory', margin, margin + 100);

    pdf.setFontSize(12);
    pdf.setFont('Helvetica', 'normal');
    let yOffset = margin + 110;
    Object.entries(speciesStocks).forEach(([species, stock], index) => {
      pdf.text(`${species}:`, margin, yOffset);
      pdf.setFont('Helvetica', 'bold');
      pdf.text(`${stock} stocks`, margin + 60, yOffset);
      pdf.setFont('Helvetica', 'normal');
      yOffset += 10;
      
      if (yOffset > pageHeight - margin) {
        pdf.addPage();
        yOffset = margin + 20;
      }
    });

    // Capture and add charts
    const treesChart = document.getElementById('trees-chart');
    const speciesChart = document.getElementById('species-chart');
    
    // Trees Planted Chart
    const treesCanvas = await html2canvas(treesChart);
    const treesImgData = treesCanvas.toDataURL('image/png');
    pdf.addPage();
    pdf.setFontSize(16);
    pdf.setFont('Helvetica', 'bold');
    pdf.text('Trees Planted Over Time', margin, margin);
    pdf.addImage(treesImgData, 'PNG', margin, margin + 10, pageWidth - (margin * 2), 80);
    
    // Species Distribution Chart
    const speciesCanvas = await html2canvas(speciesChart);
    const speciesImgData = speciesCanvas.toDataURL('image/png');
    pdf.addPage();
    pdf.setFontSize(16);
    pdf.setFont('Helvetica', 'bold');
    pdf.text('Tree Species Distribution', margin, margin);
    pdf.addImage(speciesImgData, 'PNG', margin, margin + 10, pageWidth - (margin * 2), 80);

    // Footer
    const timePeriod = document.getElementById('timePeriod').value;
    pdf.setFontSize(10);
    pdf.setFont('Helvetica', 'normal');
    pdf.setTextColor(...colors.secondary);
    pdf.text(`Report Period: ${timePeriod.charAt(0).toUpperCase() + timePeriod.slice(1)}`, 
      margin, 
      pageHeight - margin, 
      { baseline: 'bottom' }
    );

    // Save the PDF
    const fileName = `TreeStride_Report_${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(fileName);
    
  } catch (error) {
    console.error('Error generating report:', error);
    alert('Error generating report. Please try again.');
  }
}

// Add button to the HTML - add this to your existing fetchData function
function addReportButton() {
  const periodSelector = document.querySelector('.period-selector');
  if (!document.querySelector('.download-report-button')) {  // Check if button already exists
    const downloadButton = document.createElement('button');
    downloadButton.className = 'download-report-button';
    downloadButton.innerHTML = '<i class="fas fa-download"></i> Download Report';
    downloadButton.onclick = generateReport;
    periodSelector.appendChild(downloadButton);
  }
}

// Add this to the end of your fetchData function
fetchData().then(() => {
  addReportButton();
});

// Call this function after Firebase initialization
document.addEventListener('DOMContentLoaded', addReportButton);

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