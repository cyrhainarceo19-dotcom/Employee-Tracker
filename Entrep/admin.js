let currentAdminProfile = null

document.addEventListener('DOMContentLoaded', async () => {
  const session = await API.getSession()
  if (!session) { window.location.href = 'index.html'; return }

  currentAdminProfile = await API.getMyProfile()
  if (!currentAdminProfile || currentAdminProfile.role !== 'admin') {
    window.location.href = 'index.html'
    return
  }

  document.getElementById('adminName').textContent = currentAdminProfile.name
  document.getElementById('userForm').addEventListener('submit', handleSaveUser)
  await loadAllData()
})

async function loadAllData() {
  await Promise.all([
    loadAllUsers(),
    loadAllTasks(),
    loadOTRequests(),
    loadAllAttendance(),
    updateAdminStats()
  ])
}

async function updateAdminStats() {
  try {
    const { data: profiles } = await API.getAllStudents(0, 1000)
    const regularUsers = profiles || []
    const { data: allTasks } = await API.getAllTasksWithUsers(0, 1000)
    const totalHours = (allTasks || []).reduce((s, t) => s + (parseFloat(t.regular_hours) || 0), 0)
    document.getElementById('totalUsers').textContent = regularUsers.length
    document.getElementById('totalAllTasks').textContent = (allTasks || []).length
    document.getElementById('totalAllHours').textContent = totalHours.toFixed(1)
  } catch (err) {
    console.error('Stats error:', err)
  }
}

function showTab(tabName) {
  const tabs = document.querySelectorAll('.admin-tab')
  const contents = document.querySelectorAll('.tab-content')
  tabs.forEach(t => t.classList.remove('active'))
  contents.forEach(c => c.classList.remove('active'))

  if (tabName === 'users') {
    tabs[0].classList.add('active')
    document.getElementById('usersTab').classList.add('active')
    loadAllUsers()
  } else if (tabName === 'tasks') {
    tabs[1].classList.add('active')
    document.getElementById('tasksTab').classList.add('active')
    loadAllTasks()
  } else if (tabName === 'ot') {
    tabs[2].classList.add('active')
    document.getElementById('otTab').classList.add('active')
    loadOTRequests()
  } else if (tabName === 'attendance') {
    tabs[3].classList.add('active')
    document.getElementById('attendanceTab').classList.add('active')
    loadAllAttendance()
  } else {
    tabs[4].classList.add('active')
    document.getElementById('reportsTab').classList.add('active')
    generateReport()
  }
}

async function loadAllUsers() {
  try {
    const { data: users } = await API.getAllStudents(0, 1000)
    const tbody = document.getElementById('usersTableBody')

    if (!users || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="loading-text">No employees found.</td></tr>'
      return
    }

    const allTasks = await API.getAllTasksWithUsers(0, 10000)
    const taskList = allTasks.data || []

    tbody.innerHTML = users.map(user => {
      const userTasks = taskList.filter(t => t.user_id === user.id)
      const totalHours = userTasks.reduce((s, t) => s + (parseFloat(t.regular_hours) || 0), 0)
      return `<tr>
        <td>${escapeHtml(user.name)}</td>
        <td>${user.email}</td>
        <td>${escapeHtml(user.course || 'N/A')}</td>
        <td>${escapeHtml(user.school || 'N/A')}</td>
        <td>${totalHours.toFixed(1)} hrs</td>
        <td>${userTasks.length}</td>
        <td>${formatDate(user.join_date)}</td>
        <td>
          <button class="btn-view" onclick="viewUserTasks('${user.id}')"><i class="fas fa-eye"></i> View</button>
          <button class="btn-delete" onclick="deleteUser('${user.id}')"><i class="fas fa-trash"></i> Delete</button>
        </td>
      </tr>`
    }).join('')
  } catch (err) {
    showToast('Error loading users: ' + err.message, true)
  }
}

async function loadAllTasks(searchTerm) {
  try {
    const { data: tasks } = await API.getAllTasksWithUsers(0, 10000)
    const tbody = document.getElementById('tasksTableBody')

    let displayTasks = tasks || []
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      displayTasks = displayTasks.filter(t =>
        (t.profiles?.name || '').toLowerCase().includes(term) ||
        (t.description || '').toLowerCase().includes(term)
      )
    }

    if (displayTasks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="loading-text">No tasks found.</td></tr>'
      return
    }

    tbody.innerHTML = displayTasks.map(task => {
      let otHtml = ''
      if (task.ot_status === 'pending') otHtml = '<span class="ot-badge ot-pending">Pending</span>'
      else if (task.ot_status === 'approved') otHtml = '<span class="ot-badge ot-approved">Approved</span>'
      else if (task.ot_status === 'rejected') otHtml = '<span class="ot-badge ot-rejected">Rejected</span>'
      else otHtml = '<span class="ot-badge">Regular</span>'

      return `<tr>
        <td>${escapeHtml(task.profiles?.name || 'Unknown')}</td>
        <td>${formatDate(task.date)}</td>
        <td>${escapeHtml(task.description)}</td>
        <td>${task.regular_hours}</td>
        <td><span class="status-badge status-${(task.status || '').replace(/ /g, '-')}">${task.status}</span></td>
        <td>${otHtml}</td>
        <td><button class="btn-delete" onclick="deleteTaskAsAdmin('${task.id}')"><i class="fas fa-trash"></i> Delete</button></td>
      </tr>`
    }).join('')

    const searchInput = document.getElementById('searchTasks')
    if (searchInput && !searchInput._hasListener) {
      searchInput.addEventListener('input', e => loadAllTasks(e.target.value))
      searchInput._hasListener = true
    }
  } catch (err) {
    showToast('Error loading tasks: ' + err.message, true)
  }
}

async function approveOT(taskId) {
  if (!confirm('Approve this OT request?')) return
  try {
    await API.updateTaskOTStatus(taskId, 'approved')
    showToast('OT request approved!')
    loadOTRequests()
    loadAllTasks()
  } catch (err) {
    showToast('Error approving OT: ' + err.message, true)
  }
}

async function rejectOT(taskId) {
  if (!confirm('Reject this OT request?')) return
  try {
    await API.updateTaskOTStatus(taskId, 'rejected')
    showToast('OT request rejected.')
    loadOTRequests()
    loadAllTasks()
  } catch (err) {
    showToast('Error rejecting OT: ' + err.message, true)
  }
}

async function loadOTRequests() {
  try {
    const tasks = await API.getPendingOTRequests()
    const tbody = document.getElementById('otTableBody')
    if (!tbody) return

    if (!tasks || tasks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="loading-text">No pending OT requests.</td></tr>'
      return
    }

    tbody.innerHTML = tasks.map(task => `<tr>
      <td>${escapeHtml(task.profiles?.name || 'Unknown')}</td>
      <td>${formatDate(task.date)}</td>
      <td>${escapeHtml(task.description)}</td>
      <td>${task.ot_hours || 0} hrs</td>
      <td>${escapeHtml(task.ot_reason || 'No reason provided')}</td>
      <td>${formatDate(task.ot_request_date)}</td>
      <td><span class="ot-badge ot-pending">Pending</span></td>
      <td>
        <button class="btn-approve" onclick="approveOT('${task.id}')"><i class="fas fa-check"></i> Approve</button>
        <button class="btn-reject" onclick="rejectOT('${task.id}')"><i class="fas fa-times"></i> Reject</button>
      </td>
    </tr>`).join('')
  } catch (err) {
    showToast('Error loading OT requests: ' + err.message, true)
  }
}

async function viewUserTasks(userId) {
  try {
    const profile = await API.getProfileById(userId)
    const tasks = await API.getUserTasks(userId)
    const totalHours = tasks.reduce((s, t) => s + (parseFloat(t.regular_hours) || 0), 0)
    const completed = tasks.filter(t => t.status === 'Completed').length
    const content = document.getElementById('viewTasksContent')

    let tasksHtml = tasks.map(task => {
      let otHtml = ''
      if (task.ot_status === 'pending') otHtml = '<span class="ot-badge ot-pending">Pending</span>'
      else if (task.ot_status === 'approved') otHtml = '<span class="ot-badge ot-approved">Approved</span>'
      else if (task.ot_status === 'rejected') otHtml = '<span class="ot-badge ot-rejected">Rejected</span>'
      else otHtml = 'Regular'
      return `<tr>
        <td>${formatDate(task.date)}</td>
        <td>${escapeHtml(task.description)}</td>
        <td>${task.regular_hours}</td>
        <td><span class="status-badge status-${(task.status || '').replace(/ /g, '-')}">${task.status}</span></td>
        <td>${otHtml}</td>
        <td><button class="btn-delete" onclick="deleteTaskAsAdmin('${task.id}'); closeViewTasksModal();"><i class="fas fa-trash"></i> Delete</button></td>
      </tr>`
    }).join('')

    content.innerHTML = `
      <div class="student-info">
        <h3><i class="fas fa-user-tie"></i> ${escapeHtml(profile.name)}</h3>
        <p><strong>Email:</strong> ${profile.email}</p>
        <p><strong>Department:</strong> ${escapeHtml(profile.course || 'N/A')}</p>
        <p><strong>Position:</strong> ${escapeHtml(profile.school || 'N/A')}</p>
      </div>
      <div class="student-tasks-summary">
        <p><strong>Summary:</strong> Total Hours: ${totalHours.toFixed(1)} hrs | Tasks: ${tasks.length} | Completed: ${completed}</p>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Task</th><th>Hours</th><th>Status</th><th>OT Status</th><th>Actions</th></tr></thead>
          <tbody>${tasksHtml}</tbody>
        </table>
      </div>`

    document.getElementById('viewTasksTitle').innerHTML = `<i class="fas fa-tasks"></i> Tasks: ${escapeHtml(profile.name)}`
    document.getElementById('viewTasksModal').style.display = 'block'
  } catch (err) {
    showToast('Error viewing tasks: ' + err.message, true)
  }
}

function closeViewTasksModal() {
  document.getElementById('viewTasksModal').style.display = 'none'
}

async function deleteUser(userId) {
  try {
    const profile = await API.getProfileById(userId)
    if (!profile) return
    const confirmMsg = `Delete user: ${profile.name}?\n\nEmail: ${profile.email}\n\n⚠️ This will delete ALL their tasks permanently!\n\nThis action cannot be undone!`
    if (!confirm(confirmMsg)) return
    const confirmText = prompt(`Type "${profile.name}" to confirm deletion:`)
    if (confirmText !== profile.name) { showToast('Deletion cancelled - name mismatch', true); return }
    showToast('Deleting user...')
    await API.deleteUserViaEdge(userId)
    showToast(`✅ Deleted user: ${profile.name}`)
    await loadAllData()
  } catch (err) {
    showToast('❌ ' + err.message, true)
    await loadAllData()
  }
}

async function deleteTaskAsAdmin(taskId) {
  try {
    const { data: tasks } = await API.getAllTasksWithUsers(0, 10000)
    const task = (tasks || []).find(t => t.id === taskId)
    if (!task) return
    const userName = task.profiles?.name || 'Unknown'
    if (!confirm(`Delete this task?\n\nEmployee: ${userName}\nDate: ${formatDate(task.date)}\nTask: ${(task.description || '').substring(0, 60)}\nHours: ${task.regular_hours} hrs\n\nThis action cannot be undone!`)) return
    await API.deleteTask(taskId)
    showToast('✅ Task deleted successfully!')
    await loadAllData()
  } catch (err) {
    showToast('❌ Error deleting task: ' + err.message, true)
    await loadAllData()
  }
}

function openAddUserModal() {
  document.getElementById('userModalTitle').innerHTML = '<i class="fas fa-user-plus"></i> Add New Employee'
  document.getElementById('userForm').reset()
  document.getElementById('editUserId').value = ''
  document.getElementById('userModal').style.display = 'block'
}

function closeUserModal() {
  document.getElementById('userModal').style.display = 'none'
}

// Temporary UI-only migration:
// department is still stored in course until DB migration
// position is still stored in school until DB migration
async function handleSaveUser(e) {
  e.preventDefault()
  const userId = document.getElementById('editUserId').value
  const data = {
    name: document.getElementById('userName').value,
    email: document.getElementById('userEmail').value,
    password: document.getElementById('userPassword').value,
    course: document.getElementById('userCourse').value,
    school: document.getElementById('userSchool').value
  }

  if (data.password.length < 6) { showToast('Password must be at least 6 characters!', true); return }

  try {
    if (userId) {
      await API.updateProfile(userId, { name: data.name, email: data.email, course: data.course, school: data.school })
      showToast('Employee profile updated!')
    } else {
      await API.createStudent({ ...data, role: 'user' })
      showToast('Employee added!')
    }
    closeUserModal()
    await loadAllData()
  } catch (err) {
    showToast('Error saving user: ' + err.message, true)
  }
}

async function generateReport() {
  const reportDiv = document.getElementById('reportContent')
  try {
    const [users, allTasks] = await Promise.all([
      API.getAllStudentsForReport(),
      API.getAllTasksForReport()
    ])
    const taskList = allTasks || []
    let html = ''
    let grandTotalHours = 0
    let grandTotalTasks = 0

    for (const user of users) {
      const userTasks = taskList.filter(t => t.user_id === user.id)
      const totalHours = userTasks.reduce((s, t) => s + (parseFloat(t.regular_hours) || 0), 0)
      const completed = userTasks.filter(t => t.status === 'Completed').length
      grandTotalHours += totalHours
      grandTotalTasks += userTasks.length

      let tasksHtml = userTasks.map(t => `<tr>
        <td>${formatDate(t.date)}</td>
        <td>${escapeHtml(t.description)}</td>
        <td>${t.regular_hours}</td>
        <td><span class="status-badge status-${(t.status || '').replace(/ /g, '-')}">${t.status}</span></td>
        <td>${t.ot_status || 'Regular'}</td>
      </tr>`).join('')

      html += `<div class="report-user">
        <h3><i class="fas fa-user"></i> ${escapeHtml(user.name)}</h3>
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Department:</strong> ${escapeHtml(user.course || 'N/A')} | <strong>Position:</strong> ${escapeHtml(user.school || 'N/A')}</p>
        <p><strong>Total Hours:</strong> ${totalHours.toFixed(1)} hrs | <strong>Tasks:</strong> ${userTasks.length} | <strong>Completed:</strong> ${completed}</p>
        ${userTasks.length > 0
          ? `<div class="table-container"><table class="report-table"><thead><tr><th>Date</th><th>Task Description</th><th>Hours</th><th>Status</th><th>OT Status</th></tr></thead><tbody>${tasksHtml}</tbody></table></div>`
          : '<p><em>No tasks yet.</em></p>'}
      </div>`
    }

    html += `<div class="grand-total">
      <h3><i class="fas fa-chart-line"></i> Overall Summary</h3>
      <p><strong>Total Employees:</strong> ${users.length}</p>
      <p><strong>Total Hours Rendered:</strong> ${grandTotalHours.toFixed(1)} hrs</p>
      <p><strong>Total Tasks:</strong> ${grandTotalTasks}</p>
    </div>`

    reportDiv.innerHTML = html
  } catch (err) {
    reportDiv.innerHTML = '<div class="loading-text">Error generating report: ' + escapeHtml(err.message) + '</div>'
  }
}

async function exportToCSV() {
  try {
    const [users, allTasks] = await Promise.all([
      API.getAllStudentsForReport(),
      API.getAllTasksForReport()
    ])
    const taskList = allTasks || []
    let csvData = [['Employee', 'Email', 'Department', 'Position', 'Date', 'Task', 'Hours', 'Status', 'OT Status']]
    let rowCount = 0

    for (const task of taskList) {
      const user = users.find(u => u.id === task.user_id)
      if (user) {
        csvData.push([
          user.name, user.email, user.course || 'N/A', user.school || 'N/A',
          task.date, task.description, task.regular_hours, task.status, task.ot_status || 'Regular'
        ])
        rowCount++
      }
    }

    if (rowCount === 0) { showToast('No data to export', true); return }

    const csvContent = csvData.map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `employee_report_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Report exported successfully!')
  } catch (err) {
    showToast('Error exporting CSV: ' + err.message, true)
  }
}

// ---------------------------------------------------------------------------
// ATTENDANCE (admin)
// ---------------------------------------------------------------------------
async function loadAllAttendance(searchTerm, dateFilter) {
  try {
    const dateInput = document.getElementById('filterAttendanceDate')
    const targetDate = dateFilter || (dateInput ? dateInput.value : null) || new Date().toISOString().split('T')[0]

    let records = await API.getAllAttendance(targetDate)
    const tbody = document.getElementById('attendanceTableBody')
    if (!tbody) return

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      records = records.filter(r => (r.profiles?.name || '').toLowerCase().includes(term))
    }

    if (!records || records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="loading-text">No attendance records found for this date.</td></tr>'
      return
    }

    tbody.innerHTML = records.map(r => `
      <tr>
        <td>${escapeHtml(r.profiles?.name || 'Unknown')}</td>
        <td>${formatDate(r.date)}</td>
        <td>${formatTime(r.time_in)}</td>
        <td>${r.time_out ? formatTime(r.time_out) : '—'}</td>
        <td>${r.hours_rendered != null ? r.hours_rendered.toFixed(1) : '—'}</td>
        <td>
          <select class="status-select" onchange="updateAttendanceStatus('${r.id}', this.value)" ${r.deleted_at ? 'disabled' : ''}>
            <option value="present" ${r.status === 'present' ? 'selected' : ''}>Present</option>
            <option value="late" ${r.status === 'late' ? 'selected' : ''}>Late</option>
            <option value="half-day" ${r.status === 'half-day' ? 'selected' : ''}>Half Day</option>
            <option value="absent" ${r.status === 'absent' ? 'selected' : ''}>Absent</option>
            <option value="on_break" ${r.status === 'on_break' ? 'selected' : ''} disabled>On Break</option>
            <option value="timed_out" ${r.status === 'timed_out' ? 'selected' : ''} disabled>Timed Out</option>
          </select>
        </td>
        <td><span class="status-badge status-${getBreakStatusClass(r)}">${getBreakStatusLabel(r)}</span></td>
        <td>${formatBreakTime(r)}</td>
        <td>
          ${r.time_out ? `<button class="btn-reopen" onclick="reopenAttendanceRecord('${r.id}')"><i class="fas fa-undo-alt"></i> Reopen</button>` : ''}
          <button class="btn-delete" onclick="deleteAttendanceRecord('${r.id}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('')

    const searchInput = document.getElementById('searchAttendance')
    if (searchInput && !searchInput._hasAttListener) {
      searchInput.addEventListener('input', e => loadAllAttendance(e.target.value, targetDate))
      searchInput._hasAttListener = true
    }
    const filterDateInput = document.getElementById('filterAttendanceDate')
    if (filterDateInput && !filterDateInput._hasAttListener) {
      filterDateInput.value = targetDate
      filterDateInput.addEventListener('change', e => loadAllAttendance('', e.target.value))
      filterDateInput._hasAttListener = true
    }
  } catch (err) {
    showToast('Error loading attendance: ' + err.message, true)
  }
}

async function updateAttendanceStatus(id, status) {
  try {
    await API.updateAttendanceStatus(id, status)
    showToast('Attendance status updated!')
  } catch (err) {
    showToast('Error updating status: ' + err.message, true)
  }
}

async function reopenAttendanceRecord(id) {
  if (!confirm('Reopen this attendance record? This will clear the time-out value and allow the employee to time out again.')) return
  try {
    await API.reopenAttendance(id)
    showToast('Attendance record reopened. Employee can now time out again.')
    loadAllAttendance()
  } catch (err) {
    showToast('Error reopening record: ' + err.message, true)
  }
}

async function deleteAttendanceRecord(id) {
  if (!confirm('Delete this attendance record?')) return
  try {
    await API.softDeleteAttendance(id)
    showToast('Attendance record deleted.')
    loadAllAttendance()
  } catch (err) {
    showToast('Error deleting record: ' + err.message, true)
  }
}

function getBreakStatusLabel(record) {
  if (record.break_start && !record.break_end) return 'On Break'
  if (record.time_out) return 'Timed Out'
  return 'Working'
}

function getBreakStatusClass(record) {
  if (record.break_start && !record.break_end) return 'on-break'
  if (record.time_out) return 'timed-out'
  return 'working'
}

function formatBreakTime(record) {
  if (record.break_start && !record.break_end) {
    const mins = Math.round((Date.now() - new Date(record.break_start).getTime()) / 60000)
    if (mins < 1) return 'On break for <1 min'
    return `On break for ${mins} mins`
  }
  if (record.break_duration > 0) {
    const totalMins = Math.round(record.break_duration)
    if (totalMins < 60) return `${totalMins} mins`
    const hrs = Math.floor(totalMins / 60)
    const mins = totalMins % 60
    return `${hrs} hr ${mins} mins`
  }
  return '—'
}

function formatTime(isoStr) {
  if (!isoStr) return '—'
  try { return new Date(isoStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '—' }
}

async function logout() {
  await API.logout()
  window.location.href = 'index.html'
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A'
  try { return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return 'N/A' }
}

function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function showToast(message, isError = false) {
  const container = document.getElementById('toastContainer')
  if (!container) return
  const toast = document.createElement('div')
  toast.className = `toast ${isError ? 'toast-error' : ''}`
  toast.textContent = message
  container.appendChild(toast)
  setTimeout(() => toast.remove(), 3000)
}

window.showTab = showTab
window.viewUserTasks = viewUserTasks
window.closeViewTasksModal = closeViewTasksModal
window.deleteUser = deleteUser
window.deleteTaskAsAdmin = deleteTaskAsAdmin
window.openAddUserModal = openAddUserModal
window.closeUserModal = closeUserModal
window.exportToCSV = exportToCSV
window.logout = logout
window.approveOT = approveOT
window.rejectOT = rejectOT
window.loadAllAttendance = loadAllAttendance
window.updateAttendanceStatus = updateAttendanceStatus
window.reopenAttendanceRecord = reopenAttendanceRecord
window.deleteAttendanceRecord = deleteAttendanceRecord
