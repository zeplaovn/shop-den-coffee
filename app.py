from flask import Flask, render_template, request, redirect, url_for, flash, abort, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_bcrypt import Bcrypt
from functools import wraps
from datetime import datetime, timedelta
import csv
import os

from flask_wtf import FlaskForm
from wtforms import StringField, SelectField, DateField, TimeField, TextAreaField, SubmitField, PasswordField, IntegerField
from wtforms.validators import DataRequired, Length, Regexp, NumberRange, Optional
from flask_wtf.csrf import CSRFProtect
from flask_compress import Compress

from dotenv import load_dotenv

app = Flask(__name__)
CSRFProtect(app)
Compress(app)
load_dotenv('.env')

# --- Cấu hình hệ thống ---
# FIX: Thêm fallback cho SECRET_KEY thay vì để None làm crash app
secret_key = os.environ.get('SECRET_KEY')
if not secret_key:
    import warnings
    warnings.warn('SECRET_KEY không được đặt trong .env — dùng fallback tạm thời. KHÔNG dùng trong production!', stacklevel=2)
    secret_key = 'dev-fallback-key-change-in-production'
app.config['SECRET_KEY'] = secret_key

database_url = os.environ.get('DATABASE_URL', 'sqlite:///coffee.db')
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)
app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=8)

# Static files cache 1 năm — browser không tải lại CSS/JS khi không đổi
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = timedelta(days=365)

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Vui lòng đăng nhập để tiếp tục.'

# Cache-busting: tính toán mã hash một lần khi khởi động
import subprocess

def get_git_revision_short_hash():
    try:
        return subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], 
                                     stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        return os.environ.get('ASSET_VERSION', '1')

ASSET_VERSION = get_git_revision_short_hash()

@app.context_processor
def inject_asset_version():
    return dict(asset_version=ASSET_VERSION)

admin_user = os.environ.get('ADMIN_USER')
admin_password = os.environ.get('ADMIN_PASSWORD')
manager_user = os.environ.get('MANAGER_USER')
manager_password = os.environ.get('MANAGER_PASSWORD')


# --- Form Definitions ---
class BookingForm(FlaskForm):
    name = StringField('Họ và tên', validators=[DataRequired(), Length(min=2, max=100)])
    phone = StringField('Số điện thoại', validators=[DataRequired(), Regexp(r'^(0|\+84)[0-9]{8,10}$')])
    type = SelectField('Loại yêu cầu', choices=[('booking', 'Đặt bàn trước'), ('member', 'Đăng ký thành viên')])
    # FIX: Đổi format thành '%d/%m/%Y' để khớp với Flatpickr dateFormat: "d/m/Y"
    date = DateField('Ngày', format='%d/%m/%Y', validators=[DataRequired()])
    time = TimeField('Giờ', validators=[DataRequired()])
    note = TextAreaField('Ghi chú thêm')
    submit = SubmitField('Gửi Yêu Cầu')

class MenuItemForm(FlaskForm):
    name = StringField('Tên món', validators=[DataRequired(), Length(min=1, max=100)])
    category = SelectField('Danh mục', choices=[('coffee', 'Cà phê'), ('cake', 'Bánh ngọt'), ('drink', 'Đồ uống khác')])
    price = IntegerField('Giá (VNĐ)', validators=[DataRequired(), NumberRange(min=0)])
    description = TextAreaField('Mô tả', validators=[Optional(), Length(max=255)])
    image_url = StringField('URL hình ảnh', validators=[Optional(), Length(max=500)])
    submit = SubmitField('Lưu')

# --- Database Models ---
class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='manager')

    def set_password(self, raw_password):
        self.password = bcrypt.generate_password_hash(raw_password).decode('utf-8')
    def check_password(self, raw_password):
        return bcrypt.check_password_hash(self.password, raw_password)

class MenuItem(db.Model):
    __tablename__ = 'menu_items'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(20), nullable=False, default='coffee')
    price = db.Column(db.Integer, nullable=False)
    description = db.Column(db.String(255))
    image_url = db.Column(db.String(500))

class Appointment(db.Model):
    __tablename__ = 'appointments'
    id = db.Column(db.Integer, primary_key=True)
    customer_name = db.Column(db.String(100), nullable=False)
    customer_phone = db.Column(db.String(20), nullable=False)
    booking_date = db.Column(db.Date, nullable=False)
    booking_time = db.Column(db.Time, nullable=False)
    booking_type = db.Column(db.String(20), nullable=False)
    note = db.Column(db.Text)
    _is_confirmed = db.Column('is_confirmed', db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    @property
    def is_confirmed(self):
        return bool(self._is_confirmed)

    @is_confirmed.setter
    def is_confirmed(self, value):
        self._is_confirmed = bool(value)

# --- Phân quyền Decorator ---
def role_required(*roles):
    def decorator(f):
        @wraps(f)
        @login_required
        def wrapped(*args, **kwargs):
            if current_user.role not in roles:
                abort(403)
            return f(*args, **kwargs)
        return wrapped
    return decorator

# --- Logic Hệ Thống ---
def seed_database():
    with app.app_context():
        if not User.query.filter_by(username=admin_user).first():
            admin = User(username=admin_user, role='admin')
            admin.set_password(admin_password)
            db.session.add(admin)

        if not User.query.filter_by(username=manager_user).first():
            manager = User(username=manager_user, role='manager')
            manager.set_password(manager_password)
            db.session.add(manager)

        db.session.commit()

        # Import từ CSV khi bảng menu_items đang trống
        if MenuItem.query.count() == 0:
            csv_path = os.path.join(app.root_path, 'data', 'menu.csv')
            if os.path.exists(csv_path):
                try:
                    with open(csv_path, mode='r', encoding='utf-8') as f:
                        reader = csv.DictReader(f)
                        for row in reader:
                            item = MenuItem()
                            item.name = row.get('name', '').strip()
                            item.category = row.get('category', 'coffee').strip()
                            item.price = int(row.get('price', 0))
                            item.description = row.get('description', '').strip()
                            item.image_url = row.get('image_url', '').strip()
                            db.session.add(item)
                    db.session.commit()
                    print(f"Đã import menu từ file CSV thành công.")
                except Exception as e:
                    db.session.rollback()
                    print(f"Lỗi khi đọc file CSV: {e}")

# --- Routes Khách Hàng ---
@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

@app.route('/')
def index():
    form = BookingForm()
    selected_items = session.get('cart', [])
    if selected_items:
        items_string = ", ".join(selected_items)
        form.note.data = f"Món dự kiến khi đến quán: {items_string}."
    coffees = MenuItem.query.filter_by(category='coffee').all()
    cakes = MenuItem.query.filter_by(category='cake').all()
    return render_template(
        'index.html',
        coffees=coffees,
        cakes=cakes,
        form=form,
        selected_items=selected_items
    )

@app.route('/add-to-cart', methods=['POST'])
def add_to_cart():
    data = request.get_json()
    item_name = data.get('name')
    if 'cart' not in session:
        session['cart'] = []
    cart = session['cart']
    if item_name not in cart:
        cart.append(item_name)
    session['cart'] = cart
    session.modified = True
    return jsonify({'status': 'success', 'message': 'Đã lưu vào danh sách mong muốn'})

@app.route('/remove-from-cart', methods=['POST'])
def remove_from_cart():
    data = request.get_json()
    item_name = data.get('name')
    cart = session.get('cart', [])
    if item_name in cart:
        cart.remove(item_name)
        session['cart'] = cart
        session.modified = True
    return jsonify({'status': 'success'})

@app.route('/add_booking', methods=['POST'])
def add_booking():
    form = BookingForm()
    if form.validate_on_submit():
        if form.date.data < datetime.today().date():
            flash('Ngày đặt bàn không hợp lệ. Vui lòng chọn từ hôm nay trở đi.', 'error')
            return redirect(url_for('index') + '#booking')
        new_booking = Appointment(
            customer_name=form.name.data,
            customer_phone=form.phone.data,
            booking_date=form.date.data,
            booking_time=form.time.data,
            booking_type=form.type.data,
            note=form.note.data
        )
        db.session.add(new_booking)
        db.session.commit()
        session.pop('cart', None)
        flash('Đặt bàn thành công! Chúng tôi sẽ liên hệ xác nhận sớm nhất.', 'success')
    else:
        # Hiển thị lỗi field cụ thể để người dùng biết sửa chỗ nào
        for field, errors in form.errors.items():
            for error in errors:
                flash(f'Lỗi — {error}', 'error')
    return redirect(url_for('index') + '#booking')


# --- Routes Quản Lý ---
class LoginForm(FlaskForm):
    username = StringField('Tên đăng nhập', validators=[DataRequired()])
    password = PasswordField('Mật khẩu', validators=[DataRequired()])
    submit = SubmitField('Đăng Nhập →')

@app.route('/login', methods=['GET', 'POST'])
def login():
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(username=form.username.data).first()
        if user and user.check_password(form.password.data):
            login_user(user)
            return redirect(
                url_for('admin_dashboard')
                if user.role == 'admin'
                else url_for('manager_dashboard')
            )
        flash('Sai thông tin đăng nhập.', 'error')
    return render_template('login.html', form=form)

@app.route('/logout')
def logout():
    logout_user()
    return redirect(url_for('login'))

# --- Dashboard cho Admin ---
@app.route('/admin')
@role_required('admin')
def admin_dashboard():
    # FIX: Giới hạn 200 bản ghi gần nhất, tránh tải toàn bộ DB vào RAM
    bookings = Appointment.query.order_by(Appointment.created_at.desc()).limit(200).all()
    menu_items = MenuItem.query.order_by(MenuItem.category, MenuItem.name).all()
    form = MenuItemForm()
    return render_template('admin.html', bookings=bookings, menu_items=menu_items, form=form)

# --- Dashboard cho Manager ---
@app.route('/manager')
@role_required('manager', 'admin')
def manager_dashboard():
    menu = MenuItem.query.all()
    bookings = Appointment.query.order_by(Appointment.booking_date.asc(), Appointment.booking_time.asc()).all()
    return render_template('manager.html', menu=menu, bookings=bookings)

# --- Xác nhận đặt bàn ---
@app.route('/confirm_booking/<int:id>', methods=['POST'])
@role_required('admin', 'manager')
def confirm_booking(id):
    booking = db.session.get(Appointment, id)
    if booking:
        booking.is_confirmed = True
        db.session.commit()
        flash(f'Đã xác nhận đơn của {booking.customer_name}.', 'success')
    else:
        flash('Không tìm thấy đặt bàn.', 'error')
    return redirect(request.referrer or url_for('manager_dashboard'))

# --- Xóa đặt bàn (chỉ Admin) ---
@app.route('/delete_booking/<int:id>', methods=['POST'])
@role_required('admin')
def delete_booking(id):
    booking = db.session.get(Appointment, id)
    if booking:
        db.session.delete(booking)
        db.session.commit()
        flash(f'Đã xoá đơn của {booking.customer_name}.', 'success')
    else:
        flash('Không tìm thấy đặt bàn.', 'error')
    return redirect(request.referrer or url_for('admin_dashboard'))

# --- Manager hủy đặt bàn ---
@app.route('/cancel_booking/<int:id>', methods=['POST'])
@role_required('manager', 'admin')
def cancel_booking(id):
    booking = db.session.get(Appointment, id)
    if booking:
        if booking.is_confirmed:
            flash('Không thể hủy đơn đã xác nhận. Liên hệ Admin để xóa.', 'error')
        else:
            db.session.delete(booking)
            db.session.commit()
            flash(f'Đã hủy đơn của {booking.customer_name}.', 'success')
    else:
        flash('Không tìm thấy đặt bàn.', 'error')
    return redirect(request.referrer or url_for('manager_dashboard'))

# --- Menu CRUD (chỉ Admin) ---
@app.route('/admin/menu/add', methods=['POST'])
@role_required('admin')
def add_menu_item():
    form = MenuItemForm()
    if form.validate_on_submit():
        item = MenuItem(
            name=form.name.data.strip(),
            category=form.category.data,
            price=form.price.data,
            description=form.description.data.strip() if form.description.data else '',
            image_url=form.image_url.data.strip() if form.image_url.data else ''
        )
        db.session.add(item)
        db.session.commit()
        flash(f'Đã thêm món "{item.name}" vào thực đơn.', 'success')
    else:
        for field, errors in form.errors.items():
            for error in errors:
                flash(f'Lỗi [{field}]: {error}', 'error')
    return redirect(url_for('admin_dashboard') + '#menu')

@app.route('/admin/menu/edit/<int:id>', methods=['POST'])
@role_required('admin')
def edit_menu_item(id):
    item = db.session.get(MenuItem, id)
    if not item:
        flash('Không tìm thấy món.', 'error')
        return redirect(url_for('admin_dashboard') + '#menu')
    form = MenuItemForm()
    if form.validate_on_submit():
        item.name = form.name.data.strip()
        item.category = form.category.data
        item.price = form.price.data
        item.description = form.description.data.strip() if form.description.data else ''
        item.image_url = form.image_url.data.strip() if form.image_url.data else ''
        db.session.commit()
        flash(f'Đã cập nhật món "{item.name}".', 'success')
    else:
        for field, errors in form.errors.items():
            for error in errors:
                flash(f'Lỗi [{field}]: {error}', 'error')
    return redirect(url_for('admin_dashboard') + '#menu')

@app.route('/admin/menu/delete/<int:id>', methods=['POST'])
@role_required('admin')
def delete_menu_item(id):
    item = db.session.get(MenuItem, id)
    if item:
        name = item.name
        db.session.delete(item)
        db.session.commit()
        flash(f'Đã xoá món "{name}".', 'success')
    else:
        flash('Không tìm thấy món.', 'error')
    return redirect(url_for('admin_dashboard') + '#menu')

# --- Trang lỗi ---
@app.errorhandler(403)
def forbidden(e):
    return render_template('403.html'), 403

@app.errorhandler(404)
def not_found(e):
    return render_template('404.html'), 404

with app.app_context():
    db.create_all()
    seed_database()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=2005, debug=True)
