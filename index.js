// Import required modules
const express = require('express'); 
const path = require('path'); 
const bodyParser = require('body-parser'); 
const session = require('express-session'); 
const bcrypt = require('bcrypt'); 
const supabase = require('./supabase'); 

const app = express();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}/`);
});

/* ==========================
   Middleware Setup
========================== */
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Set EJS as the templating engine and specify the views directory
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/* ==========================
   Helper Functions
========================== */

// Middleware to ensure route is accessible only if user is logged in
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }
  res.redirect('/login');
}

// Helper to fetch past performance stats for a given user + exercise
async function fetchPerformanceData(userId, exerciseName) {
  const { data: allPastSets, error: performanceError } = await supabase
    .from('workouts')
    .select('weight, reps')
    .eq('user_id', userId)
    .eq('exercise_name', exerciseName);

  if (performanceError) {
    console.error("Error fetching past performance:", performanceError);
    return null;
  }

  if (!allPastSets || allPastSets.length === 0) {
    // No past sets => no performance data
    return null;
  }

  let totalWeight = 0;
  let totalReps = 0;
  let totalSets = allPastSets.length;
  for (const record of allPastSets) {
    totalWeight += record.weight * record.reps;
    totalReps += record.reps;
  }

  const avgWeightPerRep = totalWeight / totalReps; 
  const avgRepsPerSet = totalReps / totalSets;

  return {
    averageWeight: avgWeightPerRep.toFixed(1),
    averageReps: avgRepsPerSet.toFixed(1),
    totalSets
  };
}

// Helper: Return "type1", "type2", or "type3" for the given exerciseIndex
// (You already have a 3-exercise workout: indexes 0->type1, 1->type2, 2->type3)
function getTypeForIndex(index) {
  if (index === 0) return 'type1';
  if (index === 1) return 'type2';
  return 'type3'; 
}

// Fetch a single random exercise of the given 'type' from the DB
// that matches muscleGroup + optional dumbbellOnly
async function getRandomExerciseOfType(userId, muscleGroup, dumbbellOnly, type) {
  // Grab all exercises for that muscleGroup
  let query = supabase
    .from('exercises')
    .select('*')
    .eq('muscle_group', muscleGroup);

  // If dumbbellOnly is true, filter further
  if (dumbbellOnly) {
    query = query.eq('dumbbell_only', true);
  }

  const { data: groupExercises, error } = await query;
  if (error) {
    console.error("Error fetching exercises for swap:", error);
    return { exercise_name: "Exercise Not Available", lastPerformance: null, type };
  }
  if (!groupExercises || groupExercises.length === 0) {
    return { exercise_name: "Exercise Not Available", lastPerformance: null, type };
  }

  // Filter by the exercise's type property
  const typedExercises = groupExercises.filter(ex => ex.type === type);
  if (typedExercises.length === 0) {
    // no exercises of that type
    return { exercise_name: "Exercise Not Available", lastPerformance: null, type };
  }
  // Random pick
  const exercise = typedExercises[Math.floor(Math.random() * typedExercises.length)];
  // Get last performance
  const lastPerformance = await fetchPerformanceData(userId, exercise.exercise_name);
  return { ...exercise, lastPerformance };
}

// Full random generation of 3-exercise workout
async function generateWorkout(userId, muscleGroup, dumbbellOnly) {
  // Build the query
  let query = supabase
    .from('exercises')
    .select('*')
    .eq('muscle_group', muscleGroup);

  // If dumbbellOnly is true, add filter
  if (dumbbellOnly) {
    query = query.eq('dumbbell_only', true);
  }

  // Fetch exercises
  const { data: groupExercises, error } = await query;
  if (error) {
    console.error("Error fetching exercises:", error);
    return [];
  }
  if (!groupExercises || groupExercises.length === 0) {
    return [];
  }

  // Filter by type
  const type1Exercises = groupExercises.filter(ex => ex.type === 'type1');
  const type2Exercises = groupExercises.filter(ex => ex.type === 'type2');
  const type3Exercises = groupExercises.filter(ex => ex.type === 'type3');

  // Helper to pick a random exercise + fetch performance
  const pickRandom = async (arr) => {
    if (arr.length === 0) {
      return { exercise_name: "Exercise Not Available", lastPerformance: null };
    }
    const ex = arr[Math.floor(Math.random() * arr.length)];
    const perf = await fetchPerformanceData(userId, ex.exercise_name);
    return { ...ex, lastPerformance: perf };
  };

  // Build a 3-exercise plan: (type1, type2, type3)
  const workout = await Promise.all([
    pickRandom(type1Exercises),
    pickRandom(type2Exercises),
    pickRandom(type3Exercises),
  ]);
  return workout;
}

/* ==========================
   Routes
========================== */

app.get('/', (req, res) => {
  res.render('index');
});

// Registration page (GET)
app.get('/register', (req, res) => {
  res.render('register', { error: null, success: null }); 
});

// Registration page (POST)
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).render('register', { error: 'Email and password are required', success: null });
  }

  try {
    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email);
    if (fetchError) throw fetchError;

    if (existingUser && existingUser.length > 0) {
      return res.status(400).render('register', { error: 'User already exists. Please log in.', success: null });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Insert user
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{ email, password: hashedPassword }])
      .select();
    if (insertError) throw insertError;

    const user = newUser[0];
    req.session.user = { id: user.id, email: user.email };
    req.session.save(() => {
      res.redirect('/generate-workout');
    });

  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).render('register', { error: 'Registration failed. Please try again.', success: null });
  }
});

// Login page (GET)
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Login page (POST)
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).render('login', { error: 'Email and password are required' });
  }

  try {
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email);

    if (fetchError) throw fetchError;
    if (!users || users.length === 0) {
      return res.status(404).render('login', { error: 'User not found' });
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).render('login', { error: 'Invalid password' });
    }

    req.session.user = { id: user.id, email: user.email };
    res.redirect('/generate-workout');

  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).render('login', { error: 'Login failed. Please try again.' });
  }
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Generate Workout page (GET)
app.get('/generate-workout', isAuthenticated, (req, res) => {
  res.render('generate-workout', { 
    user: req.session.user, 
    muscleGroup: null, 
    workout: [], 
    dumbbellOnly: false,
    error: null 
  });
});

// Generate Workout (POST)
app.post('/generate-workout', isAuthenticated, async (req, res) => {
  const { muscleGroup, dumbbell_only } = req.body;
  const userId = req.session.user.id;
  const dumbbellOnly = (dumbbell_only === '1');

  try {
    const workout = await generateWorkout(userId, muscleGroup, dumbbellOnly);
    
    if (dumbbellOnly && workout.length === 0) {
      return res.render('generate-workout', { 
        user: req.session.user, 
        muscleGroup, 
        workout: [], 
        dumbbellOnly,
        error: 'No dumbbell-only exercises found for the selected muscle group. Please choose a different muscle group or disable "Dumbbell Only".'
      });
    }

    req.session.workout = workout;
    req.session.muscleGroup = muscleGroup;
    req.session.dumbbellOnly = dumbbellOnly;
    req.session.save(() => {
      res.render('generate-workout', { 
        user: req.session.user, 
        muscleGroup, 
        workout,
        dumbbellOnly,
        error: null
      });
    });
  } catch (err) {
    console.error("Workout Generation Error:", err);
    res.render('generate-workout', { 
      user: req.session.user, 
      muscleGroup, 
      workout: [], 
      dumbbellOnly,
      error: 'An error occurred while generating your workout. Please try again.'
    });
  }
});

// Regenerate entire Workout
app.post('/regenerate-workout', isAuthenticated, async (req, res) => {
  const userId = req.session.user.id;
  const muscleGroup = req.session.muscleGroup;
  const dumbbellOnly = req.session.dumbbellOnly; 

  if (!muscleGroup) {
    return res.redirect('/generate-workout');
  }

  try {
    const workout = await generateWorkout(userId, muscleGroup, dumbbellOnly);
    
    if (dumbbellOnly && workout.length === 0) {
      return res.render('generate-workout', { 
        user: req.session.user, 
        muscleGroup, 
        workout: [], 
        dumbbellOnly,
        error: 'No dumbbell-only exercises found for the selected muscle group.'
      });
    }

    req.session.workout = workout;
    req.session.save(() => {
      // By default, we show "workout.ejs"
      res.render('workout', { 
        user: req.session.user,
        workout, 
        muscleGroup 
      });
    });
  } catch (err) {
    console.error('Workout Regeneration Error:', err.message);
    res.status(500).send('Failed to regenerate workout');
  }
});

// NEW: Swap out an individual exercise
app.post('/swap-exercise', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const muscleGroup = req.session.muscleGroup;
    const dumbbellOnly = req.session.dumbbellOnly;
    const { exerciseIndex, sourcePage } = req.body; // sourcePage: 'generate' or 'preview'

    if (!req.session.workout) {
      return res.redirect('/generate-workout');
    }
    const index = parseInt(exerciseIndex, 10);
    if (index < 0 || index > 2) {
      return res.redirect('/generate-workout');
    }

    // Determine which type we are replacing
    // If the existing exercise has .type set in DB, we use that. Otherwise, fallback:
    let exerciseType;
    if (req.session.workout[index]?.type) {
      exerciseType = req.session.workout[index].type;
    } else {
      exerciseType = getTypeForIndex(index);
    }

    // Grab a new random exercise of the same type
    const newExercise = await getRandomExerciseOfType(userId, muscleGroup, dumbbellOnly, exerciseType);

    // Swap in the session
    req.session.workout[index] = newExercise;
    req.session.save(() => {
      // Re-render whichever page we came from
      if (sourcePage === 'preview') {
        // user was on "workout.ejs"
        return res.render('workout', {
          user: req.session.user,
          workout: req.session.workout,
          muscleGroup
        });
      } else {
        // default: user was on "generate-workout.ejs"
        return res.render('generate-workout', {
          user: req.session.user,
          muscleGroup,
          workout: req.session.workout,
          dumbbellOnly,
          error: null
        });
      }
    });
  } catch (err) {
    console.error('Error swapping exercise:', err);
    res.redirect('/generate-workout');
  }
});

// Start Workout
app.post('/start-workout', isAuthenticated, (req, res) => {
  const workout = req.session.workout;
  if (!workout || workout.length === 0) {
    return res.redirect('/generate-workout');
  }
  // Render workout-timer
  res.render('workout-timer', { workout, currentExerciseIndex: 0 });
});

// Save Workout Data
app.post('/save-workout', isAuthenticated, async (req, res) => {
  const { exercise_name, muscle_group, weight, reps } = req.body;

  if (!exercise_name || !muscle_group || typeof weight !== 'number' || typeof reps !== 'number') {
    return res.status(400).send('Invalid data');
  }

  try {
    const { error } = await supabase
      .from('workouts')
      .insert([{
        user_id: req.session.user.id,
        exercise_name,
        muscle_group,
        weight,
        reps,
        timestamp: new Date(),
      }]);

    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    console.error('Save Workout Error:', err);
    res.status(500).send('Failed to save workout');
  }
});

// Return updated performance for an exercise
app.post('/get-updated-performance', isAuthenticated, async (req, res) => {
  const { exercise_name } = req.body;
  if (!exercise_name) {
    return res.status(400).json({ error: 'exercise_name is required' });
  }
  try {
    const updatedPerformance = await fetchPerformanceData(req.session.user.id, exercise_name);
    return res.json({ lastPerformance: updatedPerformance });
  } catch (err) {
    console.error('Error fetching updated performance:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Workout Complete
app.get('/workout-complete', isAuthenticated, (req, res) => {
  res.render('workout-complete'); 
});

// Info
app.get('/info', (req, res) => {
  res.render('info');
});

// Analytics Page
app.get('/analytics', isAuthenticated, async (req, res) => {
  try {
    const { data: allExercises, error } = await supabase
      .from('exercises')
      .select('*');

    if (error) {
      console.error('Error fetching exercises:', error);
      return res.status(500).send('Error fetching exercise list');
    }

    res.render('analytics', { exercises: allExercises });
  } catch (err) {
    console.error('Analytics GET error:', err);
    res.status(500).send('Server error');
  }
});

// Analytics Data Endpoint
app.post('/analytics/data', isAuthenticated, async (req, res) => {
  const { exercise_name } = req.body;
  if (!exercise_name) {
    return res.status(400).json({ error: 'exercise_name is required' });
  }

  try {
    const { data: workoutData, error } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', req.session.user.id)
      .eq('exercise_name', exercise_name)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Error querying workouts for analytics:', error);
      return res.status(500).json({ error: 'Database query error' });
    }

    const aggregated = {};
    workoutData.forEach((w) => {
      const dateKey = new Date(w.timestamp).toISOString().split('T')[0];
      if (!aggregated[dateKey]) {
        aggregated[dateKey] = { totalWeight: 0, totalReps: 0, entries: 0 };
      }
      aggregated[dateKey].totalWeight += w.weight * w.reps;
      aggregated[dateKey].totalReps += w.reps;
      aggregated[dateKey].entries += 1;
    });

    const labels = [];
    const dataAvgWeight = [];
    const dataAvgReps = [];
    const dataTotalLoad = [];

    Object.keys(aggregated).sort().forEach((dateKey) => {
      labels.push(dateKey);

      const { totalWeight, totalReps, entries } = aggregated[dateKey];
      const avgWeight = totalWeight / totalReps;
      const avgReps = totalReps / entries;
      const totalLoad = avgWeight * avgReps;

      dataAvgWeight.push(+avgWeight.toFixed(1));
      dataAvgReps.push(+avgReps.toFixed(1));
      dataTotalLoad.push(+totalLoad.toFixed(1));
    });

    return res.json({
      labels,
      dataAvgWeight,
      dataAvgReps,
      dataTotalLoad
    });
  } catch (err) {
    console.error('Analytics data error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});