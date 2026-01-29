import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

let { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    try {
        const configPath = path.resolve(__dirname, "../e2e-env.json");
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
            NEXT_PUBLIC_SUPABASE_URL = NEXT_PUBLIC_SUPABASE_URL || config.NEXT_PUBLIC_SUPABASE_URL;
            SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_SERVICE_ROLE_KEY;
        }
    } catch (e) {
        console.warn("Could not read e2e-env.json");
    }
}

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = "harveypotensia@gmail.com";

async function checkUser() {
    console.log(`\n🔍 Checking user: ${EMAIL}\n`);

    // 1. Check auth.users
    console.log("=== auth.users ===");
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
        console.error("Auth error:", authError);
    } else {
        const authUser = users.find(u => u.email === EMAIL);
        if (authUser) {
            console.log({
                id: authUser.id,
                email: authUser.email,
                provider: authUser.app_metadata?.provider,
                providers: authUser.app_metadata?.providers,
                created_at: authUser.created_at,
            });
        } else {
            console.log("❌ Not found in auth.users");
        }
    }

    // 2. Check public.users
    console.log("\n=== public.users ===");
    const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id, email, name, signup_provider, consents_completed, consents_completed_at, created_at")
        .eq("email", EMAIL.toLowerCase())
        .maybeSingle();

    if (userError) {
        console.error("Users error:", userError);
    } else if (userData) {
        console.log(userData);
    } else {
        console.log("❌ Not found in public.users");
    }

    // 3. Check user_consents
    console.log("\n=== user_consents ===");
    if (userData?.id) {
        const { data: consentData, error: consentError } = await supabase
            .from("user_consents")
            .select("*")
            .eq("user_id", userData.id)
            .order("created_at", { ascending: false });

        if (consentError) {
            console.error("Consents error:", consentError);
        } else if (consentData && consentData.length > 0) {
            console.log(consentData);
        } else {
            console.log("❌ No consent records found");
        }
    } else {
        console.log("⏭️ Skipped (no user id)");
    }

    console.log("\n=== DIAGNOSIS ===");
    if (!userData) {
        console.log("🚨 Problem: User not in public.users table");
    } else if (!userData.consents_completed) {
        console.log("🚨 Problem: consents_completed = false → Always redirects to /consent");
    } else {
        console.log("✅ consents_completed = true");
    }
}

checkUser().catch(console.error);
