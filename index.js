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

// Middleware: ensures route is accessible only if user is logged in
function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}

// Helper: fetch average performance data
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
    return null;
  }

  let totalWeight = 0, totalReps = 0;
  const totalSets = allPastSets.length;
  allPastSets.forEach(record => {
    totalWeight += record.weight * record.reps;
    totalReps   += record.reps;
  });
  const avgWeightPerRep = totalWeight / totalReps;
  const avgRepsPerSet   = totalReps / totalSets;
  return {
    averageWeight: avgWeightPerRep.toFixed(1),
    averageReps: avgRepsPerSet.toFixed(1),
    totalSets
  };
}

// Helper: fetch max weight for Type1
async function fetchMaxWeight(userId, exerciseName) {
  const { data, error } = await supabase
    .from('workouts')
    .select('weight, reps')
    .eq('user_id', userId)
    .eq('exercise_name', exerciseName);

  if (error) {
    console.error("Error fetching max weight:", error);
    return null;
  }
  if (!data || data.length === 0) return null;

  let max = 0, repsAtMax = 0;
  data.forEach(record => {
    if (record.weight > max) {
      max = record.weight;
      repsAtMax = record.reps;
    }
  });
  return { maxWeight: max, repsAtMax };
}

function getTypeForIndex(index) {
  if (index === 0) return 'type1';
  if (index === 1) return 'type2';
  return 'type3';
}

// Fetch random exercise by type
async function getRandomExerciseOfType(userId, muscleGroup, dumbbellOnly, type) {
  let query = supabase
    .from('exercises')
    .select('*')
    .eq('muscle_group', muscleGroup);

  // If DB Only => eq('dumbbell_only', true)
  if (dumbbellOnly) {
    query = query.eq('dumbbell_only', true);
    // If your column is text "true"/"false", do eq('dumbbell_only','true')
  }

  const { data: groupExercises, error } = await query;
  if (error) {
    console.error("Error fetching exercises:", error);
    return {
      exercise_name: "Exercise Not Available",
      lastPerformance: null,
      type
    };
  }
  if (!groupExercises || groupExercises.length === 0) {
    return {
      exercise_name: "Exercise Not Available",
      lastPerformance: null,
      type
    };
  }

  const typedExercises = groupExercises.filter(ex => ex.type === type);
  if (typedExercises.length === 0) {
    return {
      exercise_name: "Exercise Not Available",
      lastPerformance: null,
      type
    };
  }

  const exercise = typedExercises[Math.floor(Math.random() * typedExercises.length)];
  const lastPerformance = await fetchPerformanceData(userId, exercise.exercise_name);
  let result = { ...exercise, lastPerformance, type };

  if (type === 'type1') {
    const maxObj = await fetchMaxWeight(userId, exercise.exercise_name);
    if (maxObj) {
      result.maxWeight = maxObj.maxWeight;
      result.repsAtMax = maxObj.repsAtMax;
    }
  }
  return result;
}

// Generate 3-exercise workout
async function generateWorkout(userId, muscleGroup, dumbbellOnly) {
  let query = supabase
    .from('exercises')
    .select('*')
    .eq('muscle_group', muscleGroup);

  if (dumbbellOnly) {
    query = query.eq('dumbbell_only', true);
  }

  const { data: groupExercises, error } = await query;
  if (error) {
    console.error("Error fetching exercises:", error);
    return [];
  }
  if (!groupExercises || groupExercises.length === 0) {
    return [];
  }

  const type1Exercises = groupExercises.filter(ex => ex.type === 'type1');
  const type2Exercises = groupExercises.filter(ex => ex.type === 'type2');
  const type3Exercises = groupExercises.filter(ex => ex.type === 'type3');

  const pickRandom = async (arr, type) => {
    if (arr.length === 0) {
      return {
        exercise_name: "Exercise Not Available",
        lastPerformance: null,
        type
      };
    }
    const ex = arr[Math.floor(Math.random() * arr.length)];
    const perf = await fetchPerformanceData(userId, ex.exercise_name);
    let result = { ...ex, lastPerformance: perf, type };

    if (type === 'type1') {
      const maxObj = await fetchMaxWeight(userId, ex.exercise_name);
      if (maxObj) {
        result.maxWeight = maxObj.maxWeight;
        result.repsAtMax = maxObj.repsAtMax;
      }
    }
    return result;
  };

  // 3-exercise plan => type1, type2, type3
  const workout = await Promise.all([
    pickRandom(type1Exercises, 'type1'),
    pickRandom(type2Exercises, 'type2'),
    pickRandom(type3Exercises, 'type3'),
  ]);
  return workout;
}

/* ==========================
   Routes
========================== */

// -------------- CHANGED THIS: redirect root to /login -------------
app.get('/', (req, res) => {
  // If you want to delete index.ejs entirely, just do this:
  res.redirect('/login');
});

// Registration (GET)
app.get('/register', (req, res) => {
  res.render('register', { error: null, success: null }); 
});

// Registration (POST)
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).render('register', {
      error: 'Email and password are required',
      success: null
    });
  }
  try {
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email);
    if (fetchError) throw fetchError;

    if (existingUser && existingUser.length > 0) {
      return res.status(400).render('register', {
        error: 'User already exists. Please log in.',
        success: null
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{ email, password: hashedPassword }])
      .select();
    if (insertError) throw insertError;

    const user = newUser[0];
    req.session.user = { id: user.id, email: user.email };
    req.session.save(() => {
      res.redirect('/generate-workout?autogen=chestArmsAndAbs');
    });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).render('register', {
      error: 'Registration failed. Please try again.',
      success: null
    });
  }
});

// Login (GET)
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Login (POST)
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).render('login', {
      error: 'Email and password are required'
    });
  }
  try {
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email);
    if (fetchError) throw fetchError;

    if (!users || users.length === 0) {
      return res.status(404).render('login', {
        error: 'User not found'
      });
    }
    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).render('login', {
        error: 'Invalid password'
      });
    }

    req.session.user = { id: user.id, email: user.email };
    // auto-generate chestArmsAndAbs 
    res.redirect('/generate-workout?autogen=chestArmsAndAbs');
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).render('login', {
      error: 'Login failed. Please try again.'
    });
  }
});

// Generate Workout (GET)
app.get('/generate-workout', isAuthenticated, async (req, res) => {
  let { autogen } = req.query;
  let muscleGroup  = req.session.muscleGroup || null;
  let dumbbellOnly = req.session.dumbbellOnly || false;
  const userId     = req.session.user.id;

  if (autogen) {
    muscleGroup = autogen;
    try {
      const workout = await generateWorkout(userId, muscleGroup, dumbbellOnly);
      req.session.workout = workout;
      req.session.muscleGroup = muscleGroup;
      req.session.save(() => {
        return res.render('generate-workout', {
          user: req.session.user,
          muscleGroup,
          workout,
          dumbbellOnly,
          error: null
        });
      });
    } catch (err) {
      console.error("Auto-Generate Workout Error:", err);
      return res.render('generate-workout', {
        user: req.session.user,
        muscleGroup: null,
        workout: [],
        dumbbellOnly,
        error: 'Failed to auto-generate workout. Please try again.'
      });
    }
  } else {
    const workout = req.session.workout || [];
    return res.render('generate-workout', {
      user: req.session.user,
      muscleGroup: req.session.muscleGroup || 'chestArmsAndAbs',
      workout,
      dumbbellOnly,
      error: null
    });
  }
});

// Generate Workout (POST)
app.post('/generate-workout', isAuthenticated, async (req, res) => {
  const { muscleGroup, dumbbell_only } = req.body;
  const userId       = req.session.user.id;
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

    req.session.workout      = workout;
    req.session.muscleGroup  = muscleGroup;
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
  const userId       = req.session.user.id;
  const muscleGroup  = req.session.muscleGroup;
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
      // show "workout.ejs"
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

// Swap out an individual exercise
app.post('/swap-exercise', isAuthenticated, async (req, res) => {
  try {
    const userId       = req.session.user.id;
    const muscleGroup  = req.session.muscleGroup;
    const dumbbellOnly = req.session.dumbbellOnly;
    const { exerciseIndex, sourcePage } = req.body;

    if (!req.session.workout) {
      return res.redirect('/generate-workout');
    }
    const index = parseInt(exerciseIndex, 10);
    if (index < 0 || index > 2) {
      return res.redirect('/generate-workout');
    }

    let exerciseType;
    if (req.session.workout[index]?.type) {
      exerciseType = req.session.workout[index].type;
    } else {
      exerciseType = getTypeForIndex(index);
    }

    const newExercise = await getRandomExerciseOfType(userId, muscleGroup, dumbbellOnly, exerciseType);
    req.session.workout[index] = newExercise;
    req.session.save(() => {
      if (sourcePage === 'preview') {
        return res.render('workout', {
          user: req.session.user,
          workout: req.session.workout,
          muscleGroup
        });
      } else {
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
      .insert([
        {
          user_id: req.session.user.id,
          exercise_name,
          muscle_group,
          weight,
          reps,
          timestamp: new Date(),
        }
      ]);
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
    res.status(500).json({ error: 'Internal server error' });
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
    workoutData.forEach(w => {
      const dateKey = new Date(w.timestamp).toISOString().split('T')[0];
      if (!aggregated[dateKey]) {
        aggregated[dateKey] = { totalWeight: 0, totalReps: 0, entries: 0 };
      }
      aggregated[dateKey].totalWeight += w.weight * w.reps;
      aggregated[dateKey].totalReps   += w.reps;
      aggregated[dateKey].entries     += 1;
    });

    const labels          = [];
    const dataAvgWeight   = [];
    const dataAvgReps     = [];
    const dataTotalLoad   = [];

    Object.keys(aggregated).sort().forEach(dateKey => {
      labels.push(dateKey);
      const { totalWeight, totalReps, entries } = aggregated[dateKey];
      const avgWeight = totalWeight / totalReps;
      const avgReps   = totalReps / entries;
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