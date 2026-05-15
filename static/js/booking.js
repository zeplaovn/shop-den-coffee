document.addEventListener('DOMContentLoaded', () => {
    const noteArea = document.querySelector('textarea[name="note"]');
    const orderButtons = document.querySelectorAll('.card-order-btn');

    // Mảng lưu trữ danh sách món tạm thời
    let selectedItems = [];

    // BUG FIX #2: Đồng bộ prefix với app.py ("Món dự kiến khi đến quán:")
    // Trước đây dùng "Món dự kiến:" — không khớp, nên selectedItems luôn bị reset khi load lại trang.
    const NOTE_PREFIX = "Món dự kiến khi đến quán:";

    if (noteArea && noteArea.value.includes(NOTE_PREFIX)) {
        // Tách đúng bằng prefix cố định thay vì split(":")[1] (dễ vỡ nếu ghi chú có dấu hai chấm)
        const rawList = noteArea.value.replace(NOTE_PREFIX, "").replace(/\.$/, "").trim();
        selectedItems = rawList.split(", ").filter(i => i !== "");
    }

    orderButtons.forEach(btn => {
        const itemName = btn.getAttribute('data-name');

        // Cập nhật trạng thái nút nếu món đã có trong danh sách
        if (selectedItems.includes(itemName)) {
            btn.innerText = "Đã chọn";
            btn.classList.add('selected');
        }

        btn.addEventListener('click', async function() {
            const isSelected = this.classList.contains('selected');

            if (!isSelected) {
                // Thêm món
                selectedItems.push(itemName);
                this.innerText = "Đã chọn";
                this.classList.add('selected');
                await fetch('/add-to-cart', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ name: itemName })
                });
            } else {
                // Bỏ chọn món
                selectedItems = selectedItems.filter(item => item !== itemName);
                this.innerText = "Chọn món này";
                this.classList.remove('selected');
                await fetch('/remove-from-cart', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ name: itemName })
                });
            }

            // Cập nhật vào ô Ghi chú (Note)
            if (noteArea) {
                if (selectedItems.length > 0) {
                    noteArea.value = NOTE_PREFIX + " " + selectedItems.join(", ") + ".";
                } else {
                    noteArea.value = "";
                }
            }
        });
    });
});

const bookingForm = document.getElementById('bookingForm');
const submitBtn   = document.getElementById('submitBtn');
if (bookingForm && submitBtn) {
    bookingForm.addEventListener('submit', () => {
      // Disable button để tránh spam click
      setTimeout(() => {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.7';
        submitBtn.querySelector('span').textContent = 'Đang gửi...';
      }, 0);
    });
}
