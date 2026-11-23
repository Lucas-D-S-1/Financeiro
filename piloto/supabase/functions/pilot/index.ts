import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { createPilot, readConfig } from "./pilot.mjs";

const config = readConfig((name: string) => Deno.env.get(name));
Deno.serve(createPilot(config, createClient));
