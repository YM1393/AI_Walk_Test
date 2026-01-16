// ============================================
// Supabase Configuration
// 아래 값들을 본인의 Supabase 프로젝트 값으로 변경하세요
// Supabase Dashboard > Settings > API 에서 확인 가능
// ============================================

const SUPABASE_URL = 'https://qnlhqwwyjkppynnjpmlj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubGhxd3d5amtwcHlubmpwbWxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NDMxOTIsImV4cCI6MjA4NDExOTE5Mn0.liWCzcXKO6UrRDO5YpgHpdhQNNn-Oa6bsIuDMK4EuPM';

// ============================================

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Admin credentials (hardcoded as requested)
const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'admin123';

// Auth helper functions
const auth = {
    // Sign up new user
    async signUp(email, password, name, role = 'therapist') {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: { name, role }
            }
        });

        if (error) throw error;

        // Create user profile in users table with pending status
        if (data.user) {
            await supabaseClient.from('users').insert({
                id: data.user.id,
                email,
                name,
                role,
                status: role === 'admin' ? 'approved' : 'pending'
            });
        }

        return data;
    },

    // Sign in
    async signIn(email, password) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        return data;
    },

    // Sign out
    async signOut() {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
    },

    // Get current user
    async getCurrentUser() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return null;

        // Get user profile
        let { data: profile } = await supabaseClient
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        // If user not in users table, create it
        if (!profile) {
            const role = user.email === 'admin@admin.com' ? 'admin' : 'therapist';
            const name = user.user_metadata?.name || user.email.split('@')[0];
            const status = role === 'admin' ? 'approved' : 'pending';

            const { data: newProfile } = await supabaseClient
                .from('users')
                .upsert({
                    id: user.id,
                    email: user.email,
                    name: name,
                    role: role,
                    status: status
                })
                .select()
                .single();

            profile = newProfile;
        }

        return { ...user, profile };
    },

    // Check if user is admin
    async isAdmin() {
        const user = await this.getCurrentUser();
        return user?.profile?.role === 'admin';
    }
};

// Patient helper functions
const patients = {
    // Get all patients for current therapist
    async getMyPatients() {
        const user = await auth.getCurrentUser();
        if (!user) return [];

        const query = supabaseClient.from('patients').select('*');

        // Admin sees all, therapist sees only their patients
        if (user.profile?.role !== 'admin') {
            query.eq('therapist_id', user.id);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    // Get all patients (admin only)
    async getAllPatients() {
        const { data, error } = await supabaseClient
            .from('patients')
            .select('*, users(name, email)')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    // Add new patient
    async addPatient(patient) {
        const user = await auth.getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabaseClient
            .from('patients')
            .insert({
                ...patient,
                therapist_id: user.id
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Update patient
    async updatePatient(id, updates) {
        const { data, error } = await supabaseClient
            .from('patients')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Delete patient
    async deletePatient(id) {
        const { error } = await supabaseClient
            .from('patients')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};

// Measurement helper functions
const measurements = {
    // Add measurement
    async addMeasurement(patientId, testType, time, timeFormatted) {
        const user = await auth.getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabaseClient
            .from('measurements')
            .insert({
                patient_id: patientId,
                therapist_id: user.id,
                test_type: testType,
                time_ms: time,
                time_formatted: timeFormatted
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Get measurements for a patient
    async getPatientMeasurements(patientId) {
        const { data, error } = await supabaseClient
            .from('measurements')
            .select('*')
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    // Get all measurements (admin)
    async getAllMeasurements() {
        const { data, error } = await supabaseClient
            .from('measurements')
            .select('*, patients(name), users(name)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    // Get my measurements (therapist)
    async getMyMeasurements() {
        const user = await auth.getCurrentUser();
        if (!user) return [];

        const { data, error } = await supabaseClient
            .from('measurements')
            .select('*, patients(name)')
            .eq('therapist_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }
};

// Therapist helper functions (admin only)
const therapists = {
    // Get all therapists
    async getAllTherapists() {
        const { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('role', 'therapist')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }
};

// Excel export helper
function exportToExcel(data, filename) {
    // Convert to CSV
    if (!data || data.length === 0) {
        alert('내보낼 데이터가 없습니다.');
        return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(h => {
            let val = row[h];
            if (val === null || val === undefined) val = '';
            if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                val = `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        }).join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}
