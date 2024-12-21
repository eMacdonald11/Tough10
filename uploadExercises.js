const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient('https://ombapbpbjuxfnuxpwndt.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tYmFwYnBianV4Zm51eHB3bmR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI2Njc5NDQsImV4cCI6MjA0ODI0Mzk0NH0.076ZicU4nYQ8tgRKtEPLSMbkVmYyc9EtW6nFKM8UxbE');

// List of exercises to insert
const exercises = [
  { exercise_name: "ATG Squats", muscle_group: "legs", type: "type1" },
  { exercise_name: "Split Squats", muscle_group: "legs", type: "type1" },
  { exercise_name: "Deadlifts", muscle_group: "legs", type: "type1" },
  { exercise_name: "ATG Lunges", muscle_group: "legs", type: "type2" },
  { exercise_name: "Jumping Squats", muscle_group: "legs", type: "type2" },
  { exercise_name: "Jumping Split Squats", muscle_group: "legs", type: "type2" },
  { exercise_name: "Heavy Calf Raises", muscle_group: "legs", type: "type3" },
  { exercise_name: "Squatted Calf Raises", muscle_group: "legs", type: "type3" },
  { exercise_name: "Weighted Pull Ups", muscle_group: "shouldersAndBack", type: "type1" },
  { exercise_name: "Dumbbell Shoulder Press", muscle_group: "shouldersAndBack", type: "type1" },
  { exercise_name: "Barbell Shoulder Press", muscle_group: "shouldersAndBack", type: "type1" },
  { exercise_name: "Yates Row", muscle_group: "shouldersAndBack", type: "type2" },
  { exercise_name: "Barbell Bent Over Rows", muscle_group: "shouldersAndBack", type: "type2" },
  { exercise_name: "Dumbbell Rows, Alternating Hands", muscle_group: "shouldersAndBack", type: "type2" },
  { exercise_name: "Bent Over Dumbbell Rows", muscle_group: "shouldersAndBack", type: "type2" },
  { exercise_name: "Kettlebell Swings", muscle_group: "shouldersAndBack", type: "type2" },
  { exercise_name: "Lateral Raises", muscle_group: "shouldersAndBack", type: "type3" },
  { exercise_name: "Bent Over Reverse Flys", muscle_group: "shouldersAndBack", type: "type3" },
  { exercise_name: "Car Drivers", muscle_group: "shouldersAndBack", type: "type3" },
  { exercise_name: "Barbell Bench Press", muscle_group: "chestArmsAndAbs", type: "type1" },
  { exercise_name: "Dumbbell Bench Press", muscle_group: "chestArmsAndAbs", type: "type1" },
  { exercise_name: "Dumbbell Incline Bench Press", muscle_group: "chestArmsAndAbs", type: "type1" },
  { exercise_name: "Chin Ups", muscle_group: "chestArmsAndAbs", type: "type1" },
  { exercise_name: "Dumbbell Bicep Curls", muscle_group: "chestArmsAndAbs", type: "type2" },
  { exercise_name: "Explosive Push Ups", muscle_group: "chestArmsAndAbs", type: "type2" },
  { exercise_name: "Barbell Bicep Curls", muscle_group: "chestArmsAndAbs", type: "type2" },
  { exercise_name: "Hammer Curls", muscle_group: "chestArmsAndAbs", type: "type2" },
  { exercise_name: "Barbell Skull Crushers", muscle_group: "chestArmsAndAbs", type: "type2" },
  { exercise_name: "Tricep Extensions", muscle_group: "chestArmsAndAbs", type: "type2" },
  { exercise_name: "Myoatic Crunch", muscle_group: "chestArmsAndAbs", type: "type3" },
  { exercise_name: "Ab Roller", muscle_group: "chestArmsAndAbs", type: "type3" },
  { exercise_name: "Full Extension Plank", muscle_group: "chestArmsAndAbs", type: "type3" },
  { exercise_name: "Bicycle Crunches", muscle_group: "chestArmsAndAbs", type: "type3" },
];

// Function to insert exercises
(async () => {
  try {
    const { data, error } = await supabase.from('exercises').insert(exercises);
    if (error) {
      console.error('Error inserting exercises:', error);
    } else {
      console.log('Exercises inserted successfully:', data);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
})();