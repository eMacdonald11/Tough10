// Import the Supabase library
const { createClient } = require('@supabase/supabase-js');

// Your Supabase project URL and Anon Key (replace with your actual values)
const SUPABASE_URL =  'https://ombapbpbjuxfnuxpwndt.supabase.co'; // Replace this with your Supabase URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tYmFwYnBianV4Zm51eHB3bmR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI2Njc5NDQsImV4cCI6MjA0ODI0Mzk0NH0.076ZicU4nYQ8tgRKtEPLSMbkVmYyc9EtW6nFKM8UxbE'; // Replace this with your Anon Key

// Create a Supabase client to interact with the database
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export the Supabase client so it can be used elsewhere in the app
module.exports = supabase;