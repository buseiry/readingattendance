// Expect firebase config at ../firebase-config.js exporting firebaseConfig or setting global firebaseConfig
(function () {
	const app = firebase.initializeApp(window.firebaseConfig || window.firebase_config || window.FIREBASE_CONFIG);
	const auth = firebase.auth();
	const db = firebase.firestore();

	window.rt = { app, auth, db };

	const byId = (id) => document.getElementById(id);

	// Basic nav actions
	const registerBtn = byId('btn-register');
	const loginBtn = byId('btn-login');
	if (registerBtn) registerBtn.onclick = () => location.href = './register.html';
	if (loginBtn) loginBtn.onclick = () => location.href = './login.html';

	// Auth state hook to show basic info
	auth.onAuthStateChanged(async (user) => {
		if (user) {
			// Check payment status
			const userDoc = await db.collection('users').doc(user.uid).get();
			const userData = userDoc.data() || {};
			
			// Show payment required if not paid
			if (!userData.paymentStatus) {
				const paymentBanner = byId('payment-required');
				const dashboardContent = byId('dashboard-content');
				if (paymentBanner) paymentBanner.style.display = 'block';
				if (dashboardContent) dashboardContent.style.display = 'none';
				return;
			}
			
			// Show dashboard if paid
			const paymentBanner = byId('payment-required');
			const dashboardContent = byId('dashboard-content');
			if (paymentBanner) paymentBanner.style.display = 'none';
			if (dashboardContent) dashboardContent.style.display = 'grid';
			
			// Update points and rank
			const dashPoints = byId('points');
			const dashRank = byId('rank');
			if (dashPoints) dashPoints.textContent = userData.points ?? 0;
			if (dashRank) dashRank.textContent = userData.rank ?? '-';
		}
	});

	// Start session (simplified approach without Cloud Functions)
	const startBtn = byId('start-session');
	if (startBtn) {
		startBtn.onclick = async () => {
			const user = auth.currentUser;
			if (!user) { alert('Please login'); return; }
			if (!user.emailVerified) { alert('Verify your email first.'); return; }
			
			try {
				// Check if user already has an active session
				const userRef = db.collection('users').doc(user.uid);
				const userSnap = await userRef.get();
				
				if (userSnap.exists() && userSnap.data().activeSession) {
					alert('You already have an active session!');
					return;
				}
				
				// Create session document
				const sessionRef = await db.collection('sessions').add({
					userId: user.uid,
					startTime: firebase.firestore.FieldValue.serverTimestamp(),
					endTime: null,
					completed: false,
					pointsAwarded: false
				});
				
				// Update user document
				await userRef.set({
					email: user.email,
					points: userSnap.exists() ? userSnap.data().points || 0 : 0,
					activeSession: true,
					lastActive: firebase.firestore.FieldValue.serverTimestamp()
				}, { merge: true });
				
				localStorage.setItem('activeSessionId', sessionRef.id);
				alert('Session started successfully!');
				location.href = './session.html';
				
			} catch (e) {
				console.error(e);
				alert('Failed to start session: ' + (e.message || 'Unknown error'));
			}
		};
	}

	// Leaderboard listener (top 10)
	const lbList = byId('leaderboard-list');
	if (lbList) {
		db.collection('users').orderBy('points', 'desc').limit(10).onSnapshot((snap) => {
			lbList.innerHTML = '';
			snap.forEach((doc) => {
				const u = doc.data();
				const li = document.createElement('li');
				li.textContent = `${u.displayName || u.email || 'User'} — ${u.points || 0}`;
				lbList.appendChild(li);
			});
		});
	}
})();


