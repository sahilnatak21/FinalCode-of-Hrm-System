import React, { useState, useEffect } from 'react';
import { getEmployees, updateEmployee } from '../utils/api';
import { toast } from '../utils/toast';

const Attendance = () => {
  const [employees, setEmployees] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        setLoading(true);
        const empData = await getEmployees();
        setEmployees(empData);
      } catch (error) {
        console.error('Error loading employees:', error);
      } finally {
        setLoading(false);
      }
    };

    loadEmployees();
    const interval = setInterval(loadEmployees, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleStatus = async (id) => {
    const employee = employees.find((emp) => emp.id === id);
    if (!employee) return;

    const newStatus = employee.status === 'Present' ? 'Absent' : 'Present';

    try {
      await updateEmployee(id, { ...employee, status: newStatus });
      toast.success(`${employee.name} marked as ${newStatus}`);
      const empData = await getEmployees();
      setEmployees(empData);
    } catch (error) {
      const errorMsg = `Failed to update status: ${error.message}`;
      toast.error(errorMsg);
      console.error('Error updating employee status:', error);
    }
  };

  const filteredEmployees = employees.filter((emp) =>
    (emp.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const presentCount = employees.filter((emp) => emp.status === 'Present').length;
  const absentCount = employees.filter((emp) => emp.status === 'Absent').length;
  const attendanceRate = employees.length > 0 ? Math.round((presentCount / employees.length) * 100) : 0;

  return (
    <>
      <header className="header">
        <h1>Attendance Tracker</h1>
        <div className="user">Admin Portal</div>
      </header>

      <section className="hero-strip">
        <div className="hero-copy">
          <span className="eyebrow">Availability Monitor</span>
          <h2>Track who is ready for team allocation in real time.</h2>
          <p>
            Attendance status feeds operational visibility and helps identify which employees are
            currently available before project teams are assembled.
          </p>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span>Total Employees</span>
            <strong>{employees.length}</strong>
          </div>
          <div className="hero-stat">
            <span>Filtered Records</span>
            <strong>{filteredEmployees.length}</strong>
          </div>
          <div className="hero-stat">
            <span>Current Search</span>
            <strong>{searchTerm ? 'Active' : 'All'}</strong>
          </div>
        </div>
      </section>

      <section className="cards">
        <div className="card green">
          <h3>Present</h3>
          <p>{presentCount}</p>
        </div>
        <div className="card orange">
          <h3>Absent</h3>
          <p>{absentCount}</p>
        </div>
        <div className="card blue">
          <h3>Attendance Rate</h3>
          <p>{attendanceRate}%</p>
        </div>
      </section>

      <section className="table-container">
        <div className="table-toolbar">
          <input
            type="text"
            className="input-control wide"
            placeholder="Search by name"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="empty-state">
            <h3>Loading employees...</h3>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="empty-state">
            <h3>No employees found</h3>
            <p>Add employees to start tracking attendance.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id}>
                    <td>{emp.name}</td>
                    <td>{emp.department}</td>
                    <td>
                      <span
                        className={`status-badge ${
                          emp.status === 'Absent' ? 'absent' : 'present'
                        }`}
                      >
                        {emp.status || 'Present'}
                      </span>
                    </td>
                    <td>
                      <button className="toggle-btn" onClick={() => handleToggleStatus(emp.id)}>
                        Toggle Status
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
};

export default Attendance;
