// Import required modules
const express = require('express'); // Framework for building the app
const path = require('path'); // Utility for handling file paths
const bodyParser = require('body-parser'); // Middleware to parse request bodies
const session = require('express-session'); // Middleware to manage user sessions
const bcrypt = require('bcrypt'); // Library for hashing passwords securely
const supabase = require('./supabase'); // Supabase client for interacting with the database

const app = express(); // Initialize the Express app
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}/`);
});

/* ==========================
   Middleware Setup
========================== */
app.use(express.json()); // Parse JSON request bodies for APIs
app.use(bodyParser.urlencoded({ extended: true })); // Parse form-encoded data for HTML forms
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files (CSS, JS, images) from 'public' directory
app.use(session({
  secret: 'your-secret-key', // Secret key for signing session cookies
  resave: false, // Don't save session if unmodified
  saveUninitialized: true, // Save uninitialized sessions
  cookie: { secure: false } // In production, set secure: true for HTTPS
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
    return next(); // User is authenticated; proceed
  }
  // If not authenticated, redirect to login
  res.redirect('/login');
}

// Function to generate a random workout for a given muscle group and equipment preference
async function generateWorkout(userId, muscleGroup, dumbbellOnly) {
  // Build the query
  let query = supabase
    .from('exercises')
    .select('*')
    .eq('muscle_group', muscleGroup);

  // If dumbbellOnly is true, add an additional filter
  if (dumbbellOnly) {
    query = query.eq('dumbbell_only', true);
  }

  // Fetch exercises from Supabase
  const { data: groupExercises, error } = await query;

  if (error) {
    console.error("Error fetching exercises:", error);
    return []; // Return empty array if error
  }

  if (!groupExercises || groupExercises.length === 0) {
    return []; // No exercises found based on filters
  }

  // Filter exercises into three categories (type1, type2, type3)
  const type1Exercises = groupExercises.filter(ex => ex.type === 'type1');
  const type2Exercises = groupExercises.filter(ex => ex.type === 'type2');
  const type3Exercises = groupExercises.filter(ex => ex.type === 'type3');

  // Helper function to pick a random exercise and fetch past performance
  const getRandomExercise = async (arr) => {
    if (arr.length === 0) {
      return { exercise_name: "Exercise Not Available", lastPerformance: null };
    }

    // Randomly pick an exercise
    const exercise = arr[Math.floor(Math.random() * arr.length)];

    // Fetch all past sets for the chosen exercise for this user
    const { data: allPastSets, error: performanceError } = await supabase
      .from('workouts')
      .select('weight, reps')
      .eq('user_id', userId)
      .eq('exercise_name', exercise.exercise_name)
      .order('timestamp', { ascending: false });

    if (performanceError) {
      console.error("Error fetching past performance:", performanceError);
    }

    let lastPerformance = null;
    if (allPastSets && allPastSets.length > 0) {
      // Aggregate total weight and reps over all recorded sets
      let totalWeight = 0;
      let totalReps = 0;
      let totalSets = allPastSets.length;

      for (const record of allPastSets) {
        totalWeight += record.weight * record.reps;
        totalReps += record.reps;
      }

      // Compute averages
      const avgWeightPerRep = totalWeight / totalReps;
      const avgRepsPerSet = totalReps / totalSets;

      lastPerformance = {
        averageWeight: avgWeightPerRep.toFixed(1),
        averageReps: avgRepsPerSet.toFixed(1),
        totalSets
      };
    }

    return { ...exercise, lastPerformance };
  };

  // Fetch one random exercise from each type
  const workout = await Promise.all([
    getRandomExercise(type1Exercises),
    getRandomExercise(type2Exercises),
    getRandomExercise(type3Exercises),
  ]);

  return workout;
}

/* ==========================
   Routes
========================== */

// Home page: Simple landing screen with links to login or register
app.get('/', (req, res) => {
  res.render('index');
});

// Registration page (GET): Shows register form
app.get('/register', (req, res) => {
  res.render('register', { error: null, success: null }); 
});

// Registration page (POST): Handles new user sign-ups
app.post('/register', async (req, res) => {
  const { email, password } = req.body;

  // Ensure email and password are provided
  if (!email || !password) {
    return res.status(400).render('register', { error: 'Email and password are required', success: null });
  }

  try {
    // Check if user already exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email);

    if (fetchError) throw fetchError;

    if (existingUser && existingUser.length > 0) {
      return res.status(400).render('register', { error: 'User already exists. Please log in.', success: null });
    }

    // Hash the password for security
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{ email, password: hashedPassword }])
      .select();

    if (insertError) throw insertError;

    const user = newUser[0];
    // Automatically log the user in
    req.session.user = { id: user.id, email: user.email };
    req.session.save(() => {
      // Redirect to generate-workout page after registration
      res.redirect('/generate-workout');
    });

  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).render('register', { error: 'Registration failed. Please try again.', success: null });
  }
});

// Login page (GET): Show login form
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Login page (POST): Handle user login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Check required fields
  if (!email || !password) {
    return res.status(400).render('login', { error: 'Email and password are required' });
  }

  try {
    // Find user by email
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email);

    if (fetchError) throw fetchError;

    if (!users || users.length === 0) {
      return res.status(404).render('login', { error: 'User not found' });
    }

    const user = users[0];
    // Compare hashed passwords
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).render('login', { error: 'Invalid password' });
    }

    // Login successful, set session
    req.session.user = { id: user.id, email: user.email };
    res.redirect('/generate-workout');

  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).render('login', { error: 'Login failed. Please try again.' });
  }
});

// Logout user
app.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Generate Workout page (GET): Shows muscle group selection and workout generation
app.get('/generate-workout', isAuthenticated, (req, res) => {
  res.render('generate-workout', { 
    user: req.session.user, 
    muscleGroup: null, 
    workout: [], 
    dumbbellOnly: false, // Default toggle state
    error: null 
  });
});

// Handle Workout Generation (POST): Create a new workout based on chosen muscle group and equipment preference
app.post('/generate-workout', isAuthenticated, async (req, res) => {
  const { muscleGroup, dumbbell_only } = req.body;
  const userId = req.session.user.id;

  // Convert 'dumbbell_only' to boolean
  const dumbbellOnly = dumbbell_only === '1' ? true : false;

  try {
    const workout = await generateWorkout(userId, muscleGroup, dumbbellOnly);
    
    if (dumbbellOnly && workout.length === 0) {
      // If dumbbell_only is selected but no exercises found
      return res.render('generate-workout', { 
        user: req.session.user, 
        muscleGroup, 
        workout: [], 
        dumbbellOnly,
        error: 'No dumbbell-only exercises found for the selected muscle group. Please choose a different muscle group or disable "Dumbbell Only".'
      });
    }

    // Store workout and muscleGroup in session for later use (e.g., starting workout)
    req.session.workout = workout;
    req.session.muscleGroup = muscleGroup;
    req.session.dumbbellOnly = dumbbellOnly; // Store preference
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

// Regenerate Workout: Allows user to generate a new random workout of the same muscle group
app.post('/regenerate-workout', isAuthenticated, async (req, res) => {
  const userId = req.session.user.id;
  const muscleGroup = req.session.muscleGroup;
  const dumbbellOnly = req.session.dumbbellOnly; // Retrieve from session

  if (!muscleGroup) {
    return res.redirect('/generate-workout');
  }

  try {
    const workout = await generateWorkout(userId, muscleGroup, dumbbellOnly);
    
    if (dumbbellOnly && workout.length === 0) {
      // If dumbbell_only is selected but no exercises found
      return res.render('generate-workout', { 
        user: req.session.user, 
        muscleGroup, 
        workout: [], 
        dumbbellOnly,
        error: 'No dumbbell-only exercises found for the selected muscle group. Please choose a different muscle group or disable "Dumbbell Only".'
      });
    }

    req.session.workout = workout;
    req.session.save(() => {
      res.render('workout', { workout, muscleGroup });
    });
  } catch (err) {
    console.error('Workout Regeneration Error:', err.message);
    res.status(500).send('Failed to regenerate workout');
  }
});

// Start Workout: Begins the workout timer and sets current exercise index to 0
app.post('/start-workout', isAuthenticated, (req, res) => {
  const workout = req.session.workout;

  if (!workout || workout.length === 0) {
    return res.redirect('/generate-workout'); // If no workout, go back
  }

  // Render the workout-timer page with initial index 0
  res.render('workout-timer', { workout, currentExerciseIndex: 0 });
});

// Save Workout Data: Save weights and reps for the completed set
app.post('/save-workout', isAuthenticated, async (req, res) => {
  const { exercise_name, muscle_group, weight, reps } = req.body;

  // Validate input
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

    // Redirect back to generate-workout or remain on same page
    res.redirect('/generate-workout');
  } catch (err) {
    console.error('Save Workout Error:', err);
    res.status(500).send('Failed to save workout');
  }
});

// Workout Complete Page: Show a celebratory screen at the end of the entire workout
app.get('/workout-complete', isAuthenticated, (req, res) => {
  res.render('workout-complete'); 
});

// Info page route
app.get('/info', (req, res) => {
  res.render('info');
});

// GET /analytics page
app.get('/analytics', isAuthenticated, async (req, res) => {
  try {
    // Optionally: fetch a list of exercises for a dropdown
    const { data: allExercises, error } = await supabase
      .from('exercises')
      .select('*');

    if (error) {
      console.error('Error fetching exercises:', error);
      return res.status(500).send('Error fetching exercise list');
    }

    // Render analytics.ejs with a list of exercises
    res.render('analytics', { exercises: allExercises });
  } catch (err) {
    console.error('Analytics GET error:', err);
    res.status(500).send('Server error');
  }
});

// POST /analytics/data 
// This route returns JSON data for the chosen exercise
app.post('/analytics/data', isAuthenticated, async (req, res) => {
  const { exercise_name } = req.body;
  if (!exercise_name) {
    return res.status(400).json({ error: 'exercise_name is required' });
  }

  try {
    // Query supabase "workouts" table for all sessions with this exercise
    // We’ll assume the 'workouts' table has columns: 
    //   user_id, exercise_name, weight, reps, timestamp 
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

    // Aggregate data by date (or session). For simplicity, group by date (YYYY-MM-DD).
    const aggregated = {};
    workoutData.forEach((w) => {
      const dateKey = new Date(w.timestamp).toISOString().split('T')[0];
      if (!aggregated[dateKey]) {
        aggregated[dateKey] = { totalWeight: 0, totalReps: 0, entries: 0 };
      }
      aggregated[dateKey].totalWeight += w.weight * w.reps;
      aggregated[dateKey].totalReps += w.reps;
      aggregated[dateKey].entries += 1; // or track sets if needed
    });

    // Build arrays for Chart.js: labels[] (dates), data[] (ex. average weight, or total load)
    const labels = [];
    const dataAvgWeight = [];
    const dataAvgReps = [];
    const dataTotalLoad = [];

    Object.keys(aggregated).sort().forEach((dateKey) => {
      labels.push(dateKey);

      const { totalWeight, totalReps } = aggregated[dateKey];
      const avgWeight = totalWeight / totalReps; // if totalReps>0
      const avgReps = totalReps / aggregated[dateKey].entries; 
      const totalLoad = avgWeight * avgReps; // or totalWeight / aggregated[dateKey].entries

      dataAvgWeight.push(+avgWeight.toFixed(1));
      dataAvgReps.push(+avgReps.toFixed(1));
      dataTotalLoad.push(+totalLoad.toFixed(1));
    });

    // Return JSON with the aggregated data
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
