// ==========================================
// 🕒 ADMIN TIME SETTINGS (หน้าตั้งค่าเวลา 4 คอลัมน์)
// ==========================================

let timeSettings = [];

function checkAdminAuth(callback) {
    if (sessionStorage.getItem('adminAuth') === 'true') {
        if (callback) callback();
        return;
    }
    Swal.fire({
        title: '🔒 เข้าสู่ระบบผู้ดูแล',
        input: 'password',
        allowOutsideClick: false,
        allowEscapeKey: false,
        confirmButtonText: 'เข้าสู่ระบบ',
        confirmButtonColor: '#0f766e',
        showLoaderOnConfirm: true,
        preConfirm: async (password) => {
            try {
                const res = await fetch(CONFIG.WEB_APP_API, { method: 'POST', body: JSON.stringify({ action: 'verifyPassword', password: password }) });
                const result = await res.json();
                if (!result.success) { Swal.showValidationMessage('รหัสผ่านไม่ถูกต้อง!'); return false; }
                return true;
            } catch (e) { Swal.showValidationMessage('การเชื่อมต่อล้มเหลว'); return false; }
        }
    }).then((result) => { if (result.isConfirmed) { sessionStorage.setItem('adminAuth', 'true'); if (callback) callback(); } });
}

document.addEventListener("DOMContentLoaded", () => {
    checkAdminAuth(fetchTimeSettings);
});

async function fetchTimeSettings() {
    try {
        const res = await fetch(CONFIG.WEB_APP_API, { method: "POST", body: JSON.stringify({ action: "getTimeSettings" }) });
        timeSettings = await res.json();
        if (!Array.isArray(timeSettings) || timeSettings.length === 0) {
            timeSettings = [{ job: 'เวร', role: '?', inTime: '08:30', outTime: '16:30' }];
        }
        renderTimeList();
    } catch (e) {
        Swal.fire("ข้อผิดพลาด", "ไม่สามารถดึงข้อมูลตั้งค่าเวลาได้", "error");
    }
}

function renderTimeList() {
    const listEl = document.getElementById('timeList');
    listEl.innerHTML = '';

    timeSettings.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = "flex flex-col md:flex-row gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 items-end md:items-center";
        row.innerHTML = `
            <div class="w-full md:flex-[2]">
                <label class="block text-[11px] font-bold text-slate-500 mb-1 pl-1">หมวด (เช่น เวร, ราว ward)</label>
                <input type="text" value="${item.job}" oninput="updateData(${index}, 'job', this.value)" class="w-full bg-white border border-slate-300 p-2.5 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-medical-500 shadow-sm" placeholder="ระบุหมวด">
            </div>
            <div class="w-full md:flex-[2]">
                <label class="block text-[11px] font-bold text-slate-500 mb-1 pl-1">ตำแหน่ง (หรือ ? สำหรับทุกคน)</label>
                <input type="text" value="${item.role}" oninput="updateData(${index}, 'role', this.value)" class="w-full bg-white border border-slate-300 p-2.5 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-medical-500 shadow-sm" placeholder="เช่น นพท. ปี 4">
            </div>
            <div class="w-full md:flex-1">
                <label class="block text-[11px] font-bold text-slate-500 mb-1 pl-1">เวลาเข้า</label>
                <input type="time" value="${item.inTime}" oninput="updateData(${index}, 'inTime', this.value)" class="w-full bg-white border border-slate-300 p-2.5 rounded-xl text-sm font-bold text-emerald-600 outline-none focus:border-medical-500 shadow-sm">
            </div>
            <div class="w-full md:flex-1">
                <label class="block text-[11px] font-bold text-slate-500 mb-1 pl-1">เวลาออก</label>
                <input type="time" value="${item.outTime}" oninput="updateData(${index}, 'outTime', this.value)" class="w-full bg-white border border-slate-300 p-2.5 rounded-xl text-sm font-bold text-rose-500 outline-none focus:border-medical-500 shadow-sm">
            </div>
            <button onclick="removeTimeRow(${index})" class="w-full md:w-auto mt-2 md:mt-0 bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-700 px-4 py-2.5 rounded-xl text-sm font-bold transition shadow-sm h-full flex items-center justify-center">
                <i class="fas fa-trash-alt sm:mr-0 mr-2"></i><span class="md:hidden">ลบหมวดนี้</span>
            </button>
        `;
        listEl.appendChild(row);
    });
}

function updateData(index, key, value) { timeSettings[index][key] = value; }
function addTimeRow() { timeSettings.push({ job: '', role: '?', inTime: '', outTime: '' }); renderTimeList(); }
function removeTimeRow(index) { timeSettings.splice(index, 1); renderTimeList(); }

async function saveAllSettings() {
    for (let i = 0; i < timeSettings.length; i++) {
        if (!timeSettings[i].job.trim() || !timeSettings[i].role.trim()) {
            return Swal.fire("ข้อมูลไม่ครบ", "กรุณากรอกชื่อหมวดและตำแหน่ง (ถ้าไม่มีให้ใส่ ?)", "warning");
        }
    }

    const btn = document.getElementById('saveBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> กำลังบันทึก...';
    btn.disabled = true;

    try {
        await fetch(CONFIG.WEB_APP_API, { method: "POST", body: JSON.stringify({ action: "saveTimeSettings", times: timeSettings }) });
        Swal.fire({ title: "สำเร็จ!", text: "บันทึกการตั้งค่าเรียบร้อย", icon: "success", timer: 1500, showConfirmButton: false });
    } catch (error) {
        Swal.fire("ข้อผิดพลาด", "บันทึกข้อมูลล้มเหลว", "error");
    } finally {
        btn.innerHTML = '<i class="fas fa-save mr-2"></i> บันทึกข้อมูล';
        btn.disabled = false;
    }
}