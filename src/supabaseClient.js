import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oahgtphcgzbqznwkupmp.supabase.co';
const supabaseKey = 'sb_publishable_Ob8DG5HdU8qW0JSaMGJumw_ZiC9tJrv';

export const supabase = createClient(supabaseUrl, supabaseKey);
