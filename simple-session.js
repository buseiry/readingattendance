// Simple Session Management (No Cloud Functions Required)
// Works with Firebase Free Tier

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, updateDoc, serverTimestamp, getDoc, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";

// Use your existing Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCMJzYUsmZsf8KBWXQD8yFCdaurd5dCauY",
  authDomain: "reading-streak.firebaseapp.com",
  projectId: "reading-streak",
  storageBucket: "reading-streak.firebasestorage.app",
  messagingSenderId: "508966325542",
  appId: "1:508966325542:web:82da076dc762ecc00fc5e7",
  measurementId: "G-TF60SVCQ5W"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let activeSessionId = null;
let sessionStartTime = null;

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  updateUI();
});

// Update UI based on auth state
function updateUI() {
  const statusEl = document.getElementById('status');
  const startBtn = document.getElementById('startBtn');
  const endBtn = document.getElementById('endBtn');
  
  if (!currentUser) {
    statusEl.textContent = 'Please login to start a session';
    startBtn.disabled = true;
    endBtn.disabled = true;
    return;
  }
  
  if (!currentUser.emailVerified) {
    statusEl.textContent = 'Please verify your email first';
    startBtn.disabled = true;
    endBtn.disabled = true;
    return;
  }
  
  // Check for active session
  checkActiveSession();
}

// Check if user has an active session
async function checkActiveSession() {
  if (!currentUser) return;
  
  try {
    // Check user's activeSession flag
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists() && userSnap.data().activeSession) {
      // Find the active session
      const sessionsRef = collection(db, "sessions");
      const q = query(
        sessionsRef,
        where("userId", "==", currentUser.uid),
        where("completed", "==", false),
        orderBy("startTime", "desc"),
        limit(1)
      );
      
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const sessionDoc = querySnapshot.docs[0];
        activeSessionId = sessionDoc.id;
        sessionStartTime = sessionDoc.data().startTime;
        
        document.getElementById('status').textContent = 'Active session running';
        document.getElementById('startBtn').disabled = true;
        document.getElementById('endBtn').disabled = false;
        
        // Start timer
        startTimer();
      }
    } else {
      document.getElementById('status').textContent = 'Ready to start session';
      document.getElementById('startBtn').disabled = false;
      document.getElementById('endBtn').disabled = true;
    }
  } catch (error) {
    console.error('Error checking active session:', error);
  }
}

// Start session
async function startSession() {
  if (!currentUser || !currentUser.emailVerified) {
    alert("Please login and verify your email first");
    return;
  }
  
  try {
    // Check if user already has an active session
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists() && userSnap.data().activeSession) {
      alert("You already have an active session!");
      return;
    }
    
    // Create session document
    const sessionRef = doc(db, "sessions");
    activeSessionId = sessionRef.id;
    
    await setDoc(sessionRef, {
      userId: currentUser.uid,
      startTime: serverTimestamp(),
      endTime: null,
      completed: false,
      pointsAwarded: false
    });
    
    // Update user document
    await updateDoc(userRef, { 
      activeSession: true,
      lastActive: serverTimestamp()
    });
    
    sessionStartTime = new Date();
    document.getElementById('status').textContent = 'Session started!';
    document.getElementById('startBtn').disabled = true;
    document.getElementById('endBtn').disabled = false;
    
    // Start timer
    startTimer();
    
    alert("Session started successfully!");
    
  } catch (error) {
    console.error('Error starting session:', error);
    alert("Failed to start session. Please try again.");
  }
}

// End session
async function endSession() {
  if (!currentUser || !activeSessionId) {
    alert("No active session to end");
    return;
  }
  
  try {
    const now = new Date();
    const sessionDuration = (now - sessionStartTime) / (1000 * 60); // minutes
    
    // Minimum session duration (e.g., 5 minutes for testing, 60 for production)
    const minDuration = 5; // Change to 60 for production
    
    if (sessionDuration < minDuration) {
      alert(`Session must be at least ${minDuration} minutes long. Current: ${Math.round(sessionDuration)} minutes`);
      return;
    }
    
    // Update session document
    const sessionRef = doc(db, "sessions", activeSessionId);
    await updateDoc(sessionRef, {
      endTime: serverTimestamp(),
      completed: true,
      durationMinutes: Math.round(sessionDuration)
    });
    
    // Award points (1 point per completed session)
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    const currentPoints = userSnap.exists() ? (userSnap.data().points || 0) : 0;
    
    await updateDoc(userRef, {
      points: currentPoints + 1,
      activeSession: false,
      lastSessionCompleted: serverTimestamp(),
      lastActive: serverTimestamp()
    });
    
    // Update session with points awarded
    await updateDoc(sessionRef, { pointsAwarded: true });
    
    // Reset UI
    document.getElementById('status').textContent = 'Session completed! Points awarded.';
    document.getElementById('startBtn').disabled = false;
    document.getElementById('endBtn').disabled = true;
    
    // Stop timer
    stopTimer();
    
    alert(`Session completed! Duration: ${Math.round(sessionDuration)} minutes. You earned 1 point!`);
    
    // Reset session variables
    activeSessionId = null;
    sessionStartTime = null;
    
  } catch (error) {
    console.error('Error ending session:', error);
    alert("Failed to end session. Please try again.");
  }
}

// Timer functionality
let timerInterval = null;

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  
  timerInterval = setInterval(() => {
    if (sessionStartTime) {
      const elapsed = Math.floor((Date.now() - sessionStartTime.getTime()) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      
      const timerEl = document.getElementById('timer');
      if (timerEl) {
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  
  const timerEl = document.getElementById('timer');
  if (timerEl) {
    timerEl.textContent = '00:00';
  }
}

// Export functions for HTML buttons
window.startSession = startSession;
window.endSession = endSession;

