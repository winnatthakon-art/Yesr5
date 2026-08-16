// ==========================================
// 📍 CHECK-IN SYSTEM (ระบบบันทึกเวลา)
// ==========================================

// ==========================================
// 🚀 INITIALIZE LIFF & DATA FETCH
// ==========================================
window.onload = async function () {
    await initializeLiff();
};

async function initializeLiff() {
    try {
        await liff.init({ liffId: CONFIG.LIFF_ID_CHECKIN });
        if (liff.isLoggedIn()) {
            getUserProfile();
        } else {
            liff.login();
        }
    } catch (error) {
        console.error('Error initializing LIFF:', error);
        Swal.fire("ข้อผิดพลาด", "ไม่สามารถเชื่อมต่อระบบ LINE ได้", "error");
    }
}

async function getUserProfile() {
    try {
        const profile = await liff.getProfile();
        document.getElementById('userId').value = profile.userId;
        await fetchData(profile.userId);
    } catch (error) {
        console.error('Error getting profile data:', error);
    }
}

async function fetchData(userId) {
    showLoading(true);
    try {
        const response = await fetch(CONFIG.WEB_APP_API, {
            method: 'POST',
            body: JSON.stringify({ action: 'fetchData', source: 'member', userId: userId })
        });
        const data = await response.json();

        // ค้นหาในชีตสมาชิก
        const userRows = data.filter(row => row[1] === userId);
        if (userRows.length > 0) {
            // เรียงวันที่หาตัวล่าสุด
            userRows.sort((a, b) => new Date(b[6]) - new Date(a[6]));
            displayData(userRows[0]);
        }
    } catch (error) {
        console.error('Error fetching data:', error);
    } finally {
        showLoading(false);
    }
}

function displayData(row) {
    document.getElementById('columnAData').value = row[1] || '';
    document.getElementById('columnBData').value = row[2] || '';
    document.getElementById('columnCData').value = row[3] || '';
    document.getElementById('columnDData').value = row[4] || '';
}

function showLoading(isLoading) {
    const overlay = document.getElementById('loadingOverlay');
    const inputs = document.querySelectorAll('input[type="radio"], textarea, button');

    if (isLoading) {
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
        inputs.forEach(input => input.disabled = true);
    } else {
        overlay.classList.remove('flex');
        overlay.classList.add('hidden');
        inputs.forEach(input => input.disabled = false);
    }
}

// ==========================================
// 🔘 RADIO BUTTON (เลือกประเภทงาน)
// ==========================================
const jobInput = document.getElementById('jobInput');

document.querySelectorAll('input[name="switch-job"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
        jobInput.value = this.value;
    });
});

// ==========================================
// 📸 CAMERA SYSTEM (ระบบกล้อง)
// ==========================================
const video = document.getElementById("camera-preview");
const previewImage = document.getElementById("preview");
const captureBtn = document.getElementById("capture-btn");
const switchCameraBtn = document.getElementById("switch-camera-btn");

let stream;
let currentFacingMode = "user"; // เริ่มต้นที่กล้องหน้า

function startCamera() {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode } })
        .then(function (videoStream) {
            stream = videoStream;
            video.srcObject = videoStream;
            captureBtn.disabled = false;
            switchCameraBtn.disabled = false;
            video.style.display = "block";
            previewImage.style.display = "none";
        })
        .catch(function (error) {
            console.error("Error accessing the camera: ", error);
            Swal.fire("ข้อผิดพลาด", "ไม่สามารถเข้าถึงกล้องได้ กรุณาตรวจสอบการอนุญาต", "error");
        });
}

function capturePhoto() {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    previewImage.src = canvas.toDataURL("image/png");
    previewImage.style.display = "block";
    video.style.display = "none";
}

function switchCamera() {
    if (stream) { stream.getTracks().forEach(track => track.stop()); }
    currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
    startCamera();
}

document.getElementById("start-camera-btn").addEventListener("click", startCamera);
captureBtn.addEventListener("click", capturePhoto);
switchCameraBtn.addEventListener("click", switchCamera);

function checkPictureAndNextStep() {
    if (!jobInput.value) {
        Swal.fire("แจ้งเตือน!", "กรุณาเลือกทำรายการ (เข้างาน/ออกงาน/ระหว่างวัน) ก่อน", "warning");
        return;
    }
    const capturedImage = previewImage.src;
    if (!capturedImage || capturedImage.includes('No-Image-Placeholder')) {
        Swal.fire("แจ้งเตือน!", "กรุณาถ่ายรูปก่อนที่จะไปยังขั้นตอนถัดไป", "warning");
    } else {
        nextStep();
    }
}

// ==========================================
// 📍 LOCATION & GEOFENCING (ระบบพิกัด)
// ==========================================
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // รัศมีโลก
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
        Math.cos(p1) * Math.cos(p2) *
        Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // คืนค่าเป็นเมตร
}

function getLocation() {
    if (navigator.geolocation) {
        Swal.fire({ title: 'กำลังค้นหาพิกัด...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
        navigator.geolocation.getCurrentPosition(displayLocation, showError, { enableHighAccuracy: true });
    } else {
        Swal.fire("ไม่รองรับ", "บราวเซอร์ของคุณไม่รองรับ Geolocation", "error");
    }
}

function showError(error) {
    Swal.close();
    let msg = "เกิดข้อผิดพลาดในการดึงพิกัด";
    if (error.code === error.PERMISSION_DENIED) msg = "คุณปฏิเสธการเข้าถึงตำแหน่ง GPS";
    if (error.code === error.POSITION_UNAVAILABLE) msg = "ไม่สามารถค้นหาตำแหน่งได้";
    if (error.code === error.TIMEOUT) msg = "หมดเวลาในการค้นหาตำแหน่ง";
    Swal.fire("เกิดข้อผิดพลาด", msg, "error");
}

function displayLocation(position) {
    Swal.close();
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    document.getElementById("latitude").innerText = lat.toFixed(6);
    document.getElementById("longitude").innerText = lng.toFixed(6);
    document.getElementById("latitudeInput").value = lat;
    document.getElementById("longitudeInput").value = lng;

    const submitBtn = document.getElementById("submitButton");

    // ตรวจสอบระยะห่าง (ดึงจาก CONFIG)
    const distance = calculateDistance(lat, lng, CONFIG.TARGET_LATITUDE, CONFIG.TARGET_LONGITUDE);

    if (distance > CONFIG.ALLOWED_RANGE_METERS) {
        Swal.fire({ icon: "error", title: "อยู่นอกพื้นที่!", text: `ระยะห่างจากเป้าหมาย: ${distance.toFixed(0)} เมตร (อนุญาต ${CONFIG.ALLOWED_RANGE_METERS}ม.)` });
        submitBtn.disabled = true;
        submitBtn.className = "w-2/3 py-4 rounded-2xl bg-slate-300 text-slate-500 font-bold cursor-not-allowed";
    } else {
        Swal.fire({ icon: "success", title: "อยู่ในพื้นที่!", text: `ระยะห่าง: ${distance.toFixed(0)} เมตร`, timer: 2000, showConfirmButton: false });
        submitBtn.disabled = false;
        submitBtn.className = "w-2/3 py-4 rounded-2xl bg-slate-800 text-white font-bold shadow-md hover:bg-slate-900 transition";
    }

    // ดึงชื่อสถานที่
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
        .then(res => res.json())
        .then(data => {
            const addr = data.display_name || "ไม่สามารถดึงข้อมูลที่อยู่ได้";
            document.getElementById("fullAddress").innerText = addr;
            document.getElementById("fullAddressInput").value = addr;
        });

    // อัปเดตแผนที่
    document.getElementById("mapIframe").src = `https://maps.google.com/maps?q=lat,lng&z=15&output=embed{lat},${lng}&hl=th&z=16&output=embed`;
}

// ==========================================
// ⏰ TIME & DATE SYSTEM
// ==========================================
function updateDateTime() {
    const now = new Date();
    document.getElementById('date').textContent = now.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('time').textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
setInterval(updateDateTime, 1000);
updateDateTime();

function getCurrentTimeInBangkok() {
    const bangkokTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    return `${String(bangkokTime.getHours()).padStart(2, '0')}:${String(bangkokTime.getMinutes()).padStart(2, '0')}`;
}
document.getElementById('currentTime').value = getCurrentTimeInBangkok();

function getFormattedDate() {
    const today = new Date();
    return `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
}
document.getElementById('todayInput').value = getFormattedDate();

// ==========================================
// 🔄 STEP CONTROLLER & SUBMIT
// ==========================================
let currentStep = 1;
function nextStep() {
    if (currentStep === 1 && !jobInput.value) {
        Swal.fire("แจ้งเตือน!", "กรุณาเลือกทำรายการ (เข้างาน/ออกงาน/ระหว่างวัน) ก่อน", "warning");
        return;
    }
    if (currentStep < 3) {
        document.getElementById(`step${currentStep}`).classList.add('hidden');
        document.getElementById(`step${currentStep}`).classList.remove('flex', 'flex-col');
        currentStep++;
        document.getElementById(`step${currentStep}`).classList.remove('hidden');
        if (currentStep === 1 || currentStep === 3) document.getElementById(`step${currentStep}`).classList.add('flex', 'flex-col');
    }
}

function prevStep() {
    if (currentStep > 1) {
        document.getElementById(`step${currentStep}`).classList.add('hidden');
        document.getElementById(`step${currentStep}`).classList.remove('flex', 'flex-col');
        currentStep--;
        document.getElementById(`step${currentStep}`).classList.remove('hidden');
        if (currentStep === 1 || currentStep === 3) document.getElementById(`step${currentStep}`).classList.add('flex', 'flex-col');
    }
}

function submitForm() {
    Swal.fire({
        title: 'ยืนยันการบันทึก',
        text: `บันทึกรายการ: ${jobInput.value}`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#1e293b',
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            document.getElementById('submitButton').disabled = true;
            Swal.fire({ title: 'กำลังบันทึกข้อมูล', text: 'กรุณารอสักครู่...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

            let obj = {
                base64: previewImage.src.split("base64,")[1],
                name: document.getElementById('columnBData').value,
                role: document.getElementById('columnCData').value,
                job: jobInput.value,
                note: document.getElementById('noteInput').value,
                today: document.getElementById('todayInput').value,
                time: document.getElementById('currentTime').value,
                lat: document.getElementById('latitudeInput').value,
                long: document.getElementById('longitudeInput').value,
                address: document.getElementById('fullAddressInput').value,
                user: document.getElementById('userId').value
            };

            fetch(CONFIG.WEB_APP_API, {
                method: "POST",
                body: JSON.stringify(obj),
            })
                .then(res => res.text())
                .then(data => {
                    Swal.fire('สำเร็จ!', 'บันทึกเวลาของคุณเรียบร้อย', 'success').then(() => { sendFlexMessage(); });
                })
                .catch(error => {
                    Swal.fire('Error!', 'ส่งข้อมูลล้มเหลว กรุณาลองใหม่', 'error');
                    document.getElementById('submitButton').disabled = false;
                });
        }
    });
}

// ==========================================
// 💬 LINE FLEX MESSAGE
// ==========================================
async function sendFlexMessage() {
    let jobColor = jobInput.value === 'เข้างาน' ? '#16a34a' : jobInput.value === 'ออกงาน' ? '#e11d48' : '#ca8a04';

    const flexMessage = {
        type: 'flex', altText: 'บันทึกเวลาปฏิบัติงาน',
        contents: {
            type: 'bubble', direction: 'ltr',
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                    {
                        type: 'box', layout: 'horizontal', contents: [
                            { type: 'text', text: 'บันทึกเวลา', weight: 'bold', size: 'md' },
                            { type: 'text', text: jobInput.value, weight: 'bold', size: 'md', color: jobColor, align: 'end' }
                        ]
                    },
                    { type: 'separator' },
                    {
                        type: 'box', layout: 'vertical', spacing: 'sm', contents: [
                            { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'ชื่อ-สกุล', weight: 'bold', size: 'sm', color: '#64748b' }, { type: 'text', text: document.getElementById('columnBData').value, size: 'sm', align: 'end' }] },
                            { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'รหัสพนักงาน', weight: 'bold', size: 'sm', color: '#64748b' }, { type: 'text', text: document.getElementById('columnCData').value, size: 'sm', align: 'end' }] }
                        ]
                    },
                    { type: 'separator' },
                    {
                        type: 'box', layout: 'vertical', contents: [
                            { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'วันที่', weight: 'bold', color: '#64748b' }, { type: 'text', text: document.getElementById('todayInput').value, weight: 'bold', align: 'end' }] },
                            { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'เวลา', weight: 'bold', color: '#64748b' }, { type: 'text', text: document.getElementById('currentTime').value, weight: 'bold', size: 'xl', color: '#e11d48', align: 'end' }] }
                        ]
                    }
                ]
            }
        }
    };
    await liff.sendMessages([flexMessage]);
    liff.closeWindow();
}