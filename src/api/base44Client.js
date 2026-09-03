import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://uzobimkcgrfsnwxreuuo.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6b2JpbWtjZ3Jmc253eHJldXVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNzE3MzUsImV4cCI6MjEwMjg0NzczNX0.0gUVSvyBeC94aRTWztELwoJ2YCDbzHyH-ud60Ah7RCY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
