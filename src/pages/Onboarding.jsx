// Onboarding: collect school, department, and level, then save to the user's
// Firestore profile. Once `school` is set, RequireOnboarding lets the user
// into the rest of the app.
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { NIGERIAN_UNIVERSITIES, ACADEMIC_LEVELS, ROUTES } from '../lib/constants';
import { Button, Card, Field, ErrorMessage } from '../components/ui';

export default function Onboarding() {
  const { user, onboardingComplete } = useAuth();

  const [school, setSchool] = useState('');
  const [otherSchool, setOtherSchool] = useState('');
  const [department, setDepartment] = useState('');
  const [level, setLevel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isOther = school === 'Other';

  // Once the profile snapshot reports a school is set, move on. Driving the
  // redirect off the live auth state (instead of a manual navigate right after
  // the write) avoids a race where the guard sees the not-yet-updated profile
  // and bounces us back here. This also forwards anyone who is already onboarded.
  if (onboardingComplete) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // If they picked "Other", use their typed value instead.
    const finalSchool = isOther ? otherSchool.trim() : school;
    if (!finalSchool) {
      setError('Please choose or enter your school.');
      return;
    }

    setBusy(true);
    try {
      // We only write the non-scoring profile fields here. Scoring fields
      // (minutes, streaks, isPremium) are never touched by the client.
      await updateDoc(doc(db, 'users', user.uid), {
        school: finalSchool,
        department: department.trim(),
        level,
      });
      // Intentionally leave `busy` true: the profile snapshot will flip
      // `onboardingComplete`, and the <Navigate> above will take us to the
      // dashboard. Resetting busy here would just flicker the button.
    } catch {
      setError('We couldn’t save your details. Please check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Tell us about you</h1>
        <p className="text-slate-600">This puts you on the right school leaderboard.</p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="school" className="block text-sm font-medium text-slate-700">
              School
            </label>
            <select
              id="school"
              required
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-900 shadow-sm
                         focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            >
              <option value="" disabled>
                Select your school
              </option>
              {NIGERIAN_UNIVERSITIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {isOther && (
            <Field
              id="otherSchool"
              label="Your school’s name"
              type="text"
              required
              value={otherSchool}
              onChange={(e) => setOtherSchool(e.target.value)}
            />
          )}

          <Field
            id="department"
            label="Department"
            type="text"
            placeholder="e.g. Electrical & Electronics Engineering"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />

          <div className="space-y-1">
            <label htmlFor="level" className="block text-sm font-medium text-slate-700">
              Level
            </label>
            <select
              id="level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-900 shadow-sm
                         focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            >
              <option value="">Select your level (optional)</option>
              {ACADEMIC_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>

          <ErrorMessage message={error} />
          <Button type="submit" busy={busy} className="w-full">
            Continue
          </Button>
        </form>
      </Card>
    </div>
  );
}
