// =============================================================================
// Employee Tracker — Supabase API Layer
// Replaces Sheet.best functions from common.js
// =============================================================================

const API = {

  // -------------------------------------------------------------------------
  // AUTH
  // -------------------------------------------------------------------------
  async login(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data.user
  },

  async signup({ name, email, password, role, course, school }) {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { name, course, school }
      }
    })
    if (error) throw error
    return data.user
  },

  async logout() {
    await sb.auth.signOut()
  },

  async getSession() {
    const { data: { session } } = await sb.auth.getSession()
    return session
  },

  // -------------------------------------------------------------------------
  // PROFILES
  // -------------------------------------------------------------------------
  async getMyProfile() {
    const session = await this.getSession()
    if (!session) return null
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
    if (error) throw error
    return data
  },

  async getProfileById(id) {
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async getAllStudents(page = 0, pageSize = 50) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error, count } = await sb
      .from('profiles')
      .select('*', { count: 'exact' })
      .eq('role', 'user')
      .order('name')
      .range(from, to)
    if (error) throw error
    return { data, total: count, page, pageSize }
  },

  async updateProfile(id, updates) {
    const session = await this.getSession()
    const { error } = await sb
      .from('profiles')
      .update({ ...updates, updated_by: session?.user?.id || id })
      .eq('id', id)
    if (error) throw error
  },

  // -------------------------------------------------------------------------
  // TASKS (user-facing)
  // -------------------------------------------------------------------------
  async getUserTasks(userId) {
    const { data, error } = await sb
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('date', { ascending: false })
    if (error) throw error
    return data
  },

  async createTask(task) {
    const session = await this.getSession()
    const { data, error } = await sb
      .from('tasks')
      .insert({
        user_id: task.user_id,
        date: task.date,
        description: task.description,
        regular_hours: task.regular_hours,
        status: task.status || 'Pending',
        ot_hours: task.ot_hours || 0,
        is_ot_only: task.is_ot_only || false,
        created_by: session?.user?.id || task.user_id
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateTask(id, updates) {
    const session = await this.getSession()
    const { data, error } = await sb
      .from('tasks')
      .update({ ...updates, updated_by: session?.user?.id })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteTask(id) {
    const session = await this.getSession()
    await sb
      .from('tasks')
      .update({ deleted_at: new Date().toISOString(), updated_by: session?.user?.id })
      .eq('id', id)
  },

  // -------------------------------------------------------------------------
  // OVERTIME
  // -------------------------------------------------------------------------
  async submitOTRequest(taskId, { otHours, otReason, otDate, otDescription, existingTask }) {
    const session = await this.getSession()
    if (existingTask) {
      const { error } = await sb
        .from('tasks')
        .update({
          ot_hours: otHours,
          ot_status: 'pending',
          ot_reason: otReason,
          ot_request_date: new Date().toISOString(),
          updated_by: session?.user?.id
        })
        .eq('id', existingTask.id)
      if (error) throw error
    } else {
      const { data, error } = await sb
        .from('tasks')
        .insert({
          user_id: session.user.id,
          date: otDate,
          description: otDescription,
          regular_hours: 0,
          status: 'Pending',
          ot_hours: otHours,
          ot_status: 'pending',
          ot_reason: otReason,
          ot_request_date: new Date().toISOString(),
          is_ot_only: true,
          created_by: session.user.id
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
  },

  async cancelOTRequest(taskId) {
    const session = await this.getSession()
    const { error } = await sb
      .from('tasks')
      .update({
        ot_hours: 0,
        ot_status: null,
        ot_reason: null,
        ot_request_date: null,
        updated_by: session?.user?.id
      })
      .eq('id', taskId)
    if (error) throw error
  },

  // -------------------------------------------------------------------------
  // ADMIN
  // -------------------------------------------------------------------------
  async getAllTasksWithUsers(page = 0, pageSize = 50) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error, count } = await sb
      .from('tasks')
      .select('*, profiles(name, email)', { count: 'exact' })
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .range(from, to)
    if (error) throw error
    return { data, total: count, page, pageSize }
  },

  async getPendingOTRequests() {
    const { data, error } = await sb
      .from('tasks')
      .select('*, profiles(name, email)')
      .eq('ot_status', 'pending')
      .is('deleted_at', null)
      .order('ot_request_date', { ascending: false })
    if (error) throw error
    return data
  },

  async updateTaskOTStatus(taskId, status) {
    const session = await this.getSession()
    const { error } = await sb
      .from('tasks')
      .update({ ot_status: status, updated_by: session?.user?.id })
      .eq('id', taskId)
    if (error) throw error
  },

  async createStudent({ name, email, password, course, school }) {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { name, course, school } }
    })
    if (error) throw error
    return data.user
  },

  async deleteUserViaEdge(userId) {
    const session = await this.getSession()
    if (!session) throw new Error('Not authenticated')
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/delete-user`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId })
      }
    )
    if (!response.ok) {
      const text = await response.text()
      let error
      try { error = JSON.parse(text).error } catch { error = text }
      throw new Error(error || 'Delete failed')
    }
  },

  // -------------------------------------------------------------------------
  // REPORTS
  // -------------------------------------------------------------------------
  async getAllStudentsForReport() {
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('role', 'user')
      .order('name')
    if (error) throw error
    return data
  },

  async getAllTasksForReport() {
    const { data, error } = await sb
      .from('tasks')
      .select('*, profiles(name, email)')
      .is('deleted_at', null)
      .order('date', { ascending: false })
    if (error) throw error
    return data
  },

  // -------------------------------------------------------------------------
  // ATTENDANCE
  // -------------------------------------------------------------------------
  async getMyAttendance(date) {
    const session = await this.getSession()
    if (!session) return null
    const targetDate = date || new Date().toISOString().split('T')[0]
    const { data, error } = await sb
      .from('attendance')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('date', targetDate)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async getMyAttendanceHistory() {
    const session = await this.getSession()
    if (!session) return []
    const { data, error } = await sb
      .from('attendance')
      .select('*')
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .order('time_in', { ascending: false })
    if (error) throw error
    return data
  },

  async clockIn() {
    const session = await this.getSession()
    if (!session) throw new Error('Not authenticated')

    const existing = await this.getMyAttendance()
    if (existing && !existing.time_out) {
      throw new Error('You already have an active session. Please clock out first.')
    }
    // If a completed record exists, reopen it instead of creating a new one
    if (existing && existing.time_out) {
      const updateData = {
        time_out: null,
        status: 'present',
        hours_rendered: null,
        updated_by: session.user.id
      }
      // Only clear break fields if the columns exist in the database
      if ('break_start' in existing) updateData.break_start = null
      if ('break_end' in existing) updateData.break_end = null
      const { data, error } = await sb
        .from('attendance')
        .update(updateData)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      return data
    }

    if (!existing) {
      const now = new Date().toISOString()
      const { data, error } = await sb
        .from('attendance')
        .insert({
          user_id: session.user.id,
          date: now.split('T')[0],
          time_in: now,
          created_by: session.user.id
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
  },

  async clockOut(attendanceId) {
    const session = await this.getSession()
    if (!session) throw new Error('Not authenticated')

    const { data: record, error: fetchError } = await sb
      .from('attendance')
      .select('*')
      .eq('id', attendanceId)
      .single()
    if (fetchError) throw fetchError
    if (!record) throw new Error('Attendance record not found')
    if (record.user_id !== session.user.id) throw new Error('You can only clock out from your own attendance')
    if (record.time_out) throw new Error('Already clocked out')

    const now = new Date()
    const timeOutISO = now.toISOString()
    const totalMs = now.getTime() - new Date(record.time_in).getTime()
    let adjustedMs = totalMs
    if (record.break_start && record.break_end) {
      const breakMs = new Date(record.break_end).getTime() - new Date(record.break_start).getTime()
      adjustedMs = Math.max(0, totalMs - breakMs)
    }
    const hoursRendered = Math.round((adjustedMs / 3600000) * 10) / 10

    const { data, error } = await sb
      .from('attendance')
      .update({
        time_out: timeOutISO,
        hours_rendered: hoursRendered,
        updated_by: session.user.id
      })
      .eq('id', attendanceId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getAllAttendance(date) {
    const targetDate = date || new Date().toISOString().split('T')[0]
    const { data, error } = await sb
      .from('attendance')
      .select('*, profiles(name, email)')
      .eq('date', targetDate)
      .is('deleted_at', null)
      .order('time_in', { ascending: false })
    if (error) throw error
    return data
  },

  async getAllAttendanceRange(from, to) {
    const { data, error } = await sb
      .from('attendance')
      .select('*, profiles(name, email)')
      .gte('date', from)
      .lte('date', to)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .order('time_in', { ascending: false })
    if (error) throw error
    return data
  },

  async updateAttendanceStatus(id, status) {
    const session = await this.getSession()
    if (!session) throw new Error('Not authenticated')
    const { error } = await sb
      .from('attendance')
      .update({ status, updated_by: session.user.id })
      .eq('id', id)
    if (error) throw error
  },

  async softDeleteAttendance(id) {
    const session = await this.getSession()
    if (!session) throw new Error('Not authenticated')
    const { error } = await sb
      .from('attendance')
      .update({ deleted_at: new Date().toISOString(), updated_by: session.user.id })
      .eq('id', id)
    if (error) throw error
  },

  async reopenAttendance(id) {
    const session = await this.getSession()
    if (!session) throw new Error('Not authenticated')
    const { error } = await sb
      .from('attendance')
      .update({ time_out: null, status: 'present', updated_by: session.user.id })
      .eq('id', id)
    if (error) throw error
  },

  async startBreak(attendanceId) {
    const session = await this.getSession()
    if (!session) throw new Error('Not authenticated')
    const { data: record, error: fetchError } = await sb
      .from('attendance')
      .select('*')
      .eq('id', attendanceId)
      .single()
    if (fetchError) throw fetchError
    if (!('break_start' in record)) {
      throw new Error('Break feature is not available. The database migration has not been applied yet.')
    }
    const { data, error } = await sb
      .from('attendance')
      .update({
        break_start: new Date().toISOString(),
        updated_by: session.user.id
      })
      .eq('id', attendanceId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async endBreak(attendanceId) {
    const session = await this.getSession()
    if (!session) throw new Error('Not authenticated')
    const { data: record, error: fetchError } = await sb
      .from('attendance')
      .select('*')
      .eq('id', attendanceId)
      .single()
    if (fetchError) throw fetchError
    const now = new Date()
    const updateData = {
      break_end: now.toISOString(),
      status: 'present',
      updated_by: session.user.id
    }
    if ('break_duration' in record && record.break_start) {
      updateData.break_duration = Math.round(((now.getTime() - new Date(record.break_start).getTime()) / 60000) * 10) / 10
    }
    const { data, error } = await sb
      .from('attendance')
      .update(updateData)
      .eq('id', attendanceId)
      .select()
      .single()
    if (error) throw error
    return data
  }
}

// Expose globally for backwards compatibility with script tags
window.API = API
