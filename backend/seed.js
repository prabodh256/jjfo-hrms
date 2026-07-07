const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding the database...');

  // Clear existing rows (child tables first to satisfy FKs) so the seed is re-runnable.
  await prisma.ticketReply.deleteMany();
  await prisma.helpdeskTicket.deleteMany();
  await prisma.leave.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.attendanceRegularization.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.payroll.deleteMany();
  await prisma.taxDeclaration.deleteMany();
  await prisma.salaryAdvance.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.shoutout.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.simulatedGDrive.deleteMany();
  await prisma.simulatedGSheets.deleteMany();
  await prisma.simulatedGmail.deleteMany();
  await prisma.docRequirement.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.payrollCycle.deleteMany();
  await prisma.employee.deleteMany();

  // Company holiday calendar (excluded from leave durations).
  await prisma.holiday.createMany({
    data: [
      { date: '2026-01-26', name: 'Republic Day' },
      { date: '2026-08-15', name: 'Independence Day' },
      { date: '2026-10-02', name: 'Gandhi Jayanti' },
      { date: '2026-11-08', name: 'Diwali' }
    ]
  });

  // Mandatory onboarding documents (admin can toggle `required` off from the UI).
  await prisma.docRequirement.createMany({
    data: [
      { key: 'educationCertificate', label: 'Education Certificate', required: true, order: 1 },
      { key: 'pastPayslip', label: 'Previous Payslip', required: true, order: 2 },
      { key: 'offerLetter', label: 'Previous Offer Letter', required: true, order: 3 },
      { key: 'relievingLetter', label: 'Relieving Letter', required: true, order: 4 },
      { key: 'idProof', label: 'Government ID Proof', required: true, order: 5 }
    ]
  });

  const passwordHash = await bcrypt.hash('password123', 12);

  // 1. Employees
  const employees = [
    {
      id: 'EMP001', name: 'Rajesh Kumar', role: 'admin', status: 'active',
      department: 'HR & Operations', designation: 'Managing Director & HR Head',
      email: 'rajesh@jjfo.com', password: passwordHash,
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      doj: '2020-01-15', age: 45, bloodGroup: 'O+', contact: '+91 98765 43210',
      salaryBasic: 150000, salaryAllow: 40000, salaryDeduct: 12000,
      experience: JSON.stringify([{ company: 'Tata Family Trust', designation: 'GM Operations', duration: '6 Years' }]),
      documents: JSON.stringify({ relievingLetter: 'EMP001_RelievingLetter.pdf', idProof: 'EMP001_IDProof.pdf' }),
      managerId: null,
      preferences: JSON.stringify({ font: 'Outfit', theme: 'indigo', density: 'comfortable' }),
      permissions: JSON.stringify({ accessFinancials: true, manageHierarchy: true, moderateHelpdesk: true })
    },
    {
      id: 'EMP002', name: 'Priya Sharma', role: 'employee', status: 'active',
      department: 'Finance & Investments', designation: 'Senior Investment Analyst',
      email: 'priya@jjfo.com', password: passwordHash,
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      doj: '2022-04-10', age: 32, bloodGroup: 'B+', contact: '+91 91234 56789',
      salaryBasic: 110000, salaryAllow: 35000, salaryDeduct: 8000,
      experience: JSON.stringify([{ company: 'Kotak Wealth', designation: 'Investment Analyst', duration: '4 Years' }]),
      documents: JSON.stringify({ relievingLetter: 'EMP002_RelievingLetter.pdf' }),
      managerId: 'EMP001',
      preferences: JSON.stringify({ font: 'Inter', theme: 'dark', fontSize: 'medium' }),
      // Team lead: can create reports (subset) and approve leaves at level 1.
      permissions: JSON.stringify({ modules: ['directory', 'onboarding', 'payroll'], caps: { createUsers: true, approveLeaves: true, accessFinancials: true } })
    },
    {
      id: 'EMP003', name: 'Amit Patel', role: 'employee', status: 'active',
      department: 'IT & Security', designation: 'Lead Systems Administrator',
      email: 'amit@jjfo.com', password: passwordHash,
      avatar: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=150',
      doj: '2021-08-01', age: 38, bloodGroup: 'A-', contact: '+91 99887 76655',
      salaryBasic: 95000, salaryAllow: 25000, salaryDeduct: 5000,
      experience: JSON.stringify([{ company: 'Infosys', designation: 'SysAdmin', duration: '7 Years' }]),
      documents: JSON.stringify({ idProof: 'EMP003_IDProof.pdf' }),
      managerId: 'EMP001',
      preferences: JSON.stringify({ font: 'Roboto', theme: 'dark', fontSize: 'medium' }),
      permissions: JSON.stringify({ modules: ['assets', 'helpdesk'], caps: { approveLeaves: true, moderateHelpdesk: true } })
    },
    {
      id: 'EMP004', name: 'Sneha Desai', role: 'employee', status: 'active',
      department: 'Legal & Compliance', designation: 'Compliance Officer',
      email: 'sneha@jjfo.com', password: passwordHash,
      avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
      doj: '2023-01-20', age: 29, bloodGroup: 'AB+', contact: '+91 98761 23456',
      salaryBasic: 85000, salaryAllow: 20000, salaryDeduct: 4000,
      experience: JSON.stringify([{ company: 'AZB & Partners', designation: 'Associate', duration: '3 Years' }]),
      documents: JSON.stringify({}),
      managerId: 'EMP002',
      preferences: JSON.stringify({ font: 'Outfit', theme: 'violet', density: 'comfortable' }),
      permissions: JSON.stringify({ accessFinancials: false, manageHierarchy: false, moderateHelpdesk: false })
    },
    {
      id: 'EMP005', name: 'Vikram Singh', role: 'candidate', status: 'onboarding_draft',
      department: 'Real Estate Management', designation: 'Property Manager',
      email: 'vikram.candidate@jjfo.com', password: passwordHash,
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      doj: '2026-07-01', age: 34, bloodGroup: 'O-', contact: '+91 90000 11122',
      salaryBasic: 70000, salaryAllow: 15000, salaryDeduct: 0,
      experience: JSON.stringify([]), education: JSON.stringify([]), documents: JSON.stringify({}),
      managerId: 'EMP001', onboardingState: 'draft',
      onboardingNote: 'Please complete your onboarding details and upload the required documents.',
      preferences: JSON.stringify({}), permissions: JSON.stringify({})
    }
  ];
  for (const emp of employees) await prisma.employee.create({ data: emp });

  // 2. Leave balances
  for (const emp of employees) {
    await prisma.leaveBalance.create({ data: { employeeId: emp.id, annual: 15, sick: 7, casual: 7 } });
  }

  // 3. Leaves
  await prisma.leave.createMany({
    data: [
      { employeeId: 'EMP002', leaveType: 'Annual Leave', startDate: '2026-07-05', endDate: '2026-07-08', durationDays: 4, reason: 'Family vacation to Europe', status: 'Pending', requiredLevels: 1, approvedLevels: 0 },
      { employeeId: 'EMP003', leaveType: 'Sick Leave', startDate: '2026-06-25', endDate: '2026-06-26', durationDays: 2, reason: 'Seasonal fever', status: 'Approved', requiredLevels: 1, approvedLevels: 1 },
      { employeeId: 'EMP004', leaveType: 'Casual Leave', startDate: '2026-07-15', endDate: '2026-07-15', durationDays: 1, reason: 'Personal errand', status: 'Pending', requiredLevels: 1, approvedLevels: 0 },
      // >5 days → needs 2 levels: EMP004 (Sneha) → EMP002 (Priya) → EMP001 (Rajesh).
      { employeeId: 'EMP004', leaveType: 'Annual Leave', startDate: '2026-08-10', endDate: '2026-08-18', durationDays: 9, reason: 'Extended family wedding', status: 'Pending', requiredLevels: 2, approvedLevels: 0 }
    ]
  });

  // 4. Attendance
  await prisma.attendance.createMany({
    data: [
      { employeeId: 'EMP002', date: '2026-06-29', checkIn: '09:12 AM', checkOut: '06:05 PM', status: 'On Time' },
      { employeeId: 'EMP002', date: '2026-06-30', checkIn: '09:45 AM', checkOut: '06:20 PM', status: 'Late' },
      { employeeId: 'EMP003', date: '2026-06-30', checkIn: '08:55 AM', checkOut: '06:00 PM', status: 'On Time' }
    ]
  });

  // 5. Assets
  await prisma.asset.createMany({
    data: [
      { employeeId: 'EMP002', name: 'MacBook Pro 16"', type: 'Laptop', serialNumber: 'LAP-MBP-983', condition: 'Excellent', status: 'Confirmed', assignedBy: 'EMP001', assignedDate: '2026-01-10' },
      { employeeId: 'EMP002', name: 'Dell 27" 4K Monitor', type: 'Monitor', serialNumber: 'MON-DELL-112', condition: 'New', status: 'Pending Employee Confirmation', assignedBy: 'EMP001', assignedDate: '2026-06-28' },
      { employeeId: 'EMP003', name: 'ThinkPad X1 Carbon', type: 'Laptop', serialNumber: 'LAP-TP-451', condition: 'Good', status: 'Confirmed', assignedBy: 'EMP001', assignedDate: '2025-09-15' }
    ]
  });

  // 6. Payroll (historical — May 2026)
  for (const emp of employees.filter(e => e.status === 'active')) {
    const gross = emp.salaryBasic + emp.salaryAllow;
    const pf = Math.round(emp.salaryBasic * 0.12);
    const tds = Math.round(gross * 0.05);
    const net = gross - pf - 200 - tds - emp.salaryDeduct;
    await prisma.payroll.create({
      data: {
        employeeId: emp.id, month: 'May 2026', basic: emp.salaryBasic, allowances: emp.salaryAllow,
        deductions: emp.salaryDeduct, pf, esi: 0, pt: 200, tds, advanceDeduction: 0,
        grossPay: gross, netPay: net, status: 'Paid', paymentDate: '2026-05-31'
      }
    });
  }

  // 7. Tax declarations
  await prisma.taxDeclaration.createMany({
    data: [
      { employeeId: 'EMP002', section80C: 150000, section80D: 25000, hraRent: 20000, otherDeductions: 0 },
      { employeeId: 'EMP003', section80C: 80000, section80D: 10000, hraRent: 15000, otherDeductions: 5000 }
    ]
  });

  // 8. Goals
  await prisma.goal.createMany({
    data: [
      { employeeId: 'EMP002', title: 'Complete annual property tax audits', progress: 75, targetDate: '2026-09-30' },
      { employeeId: 'EMP003', title: 'Migrate office to zero-trust VPN', progress: 50, targetDate: '2026-08-15' },
      { employeeId: 'EMP004', title: 'Finalise FY26 compliance filings', progress: 30, targetDate: '2026-10-31' }
    ]
  });

  // 9. Shout-outs
  await prisma.shoutout.createMany({
    data: [
      { fromId: 'EMP001', toId: 'EMP002', message: 'Kudos to Priya for the diligence on the real-estate merger!', timestamp: '2026-06-29 04:30 PM' },
      { fromId: 'EMP002', toId: 'EMP003', message: 'Thanks Amit for the rapid VPN turnaround.', timestamp: '2026-06-30 11:10 AM' }
    ]
  });

  // 10. Helpdesk tickets (with replies)
  await prisma.helpdeskTicket.create({
    data: {
      id: 'TCK001', employeeId: 'EMP002', subject: 'Access required for Bloomberg Terminal',
      category: 'Software Access', description: 'Need Bloomberg terminal access for the Q3 portfolio review.',
      priority: 'High', status: 'Open', createdDate: '2026-06-25',
      replies: { create: [{ senderId: 'EMP003', text: 'Procurement request raised; license expected by EOD.', date: '2026-06-25' }] }
    }
  });
  await prisma.helpdeskTicket.create({
    data: {
      id: 'TCK002', employeeId: 'EMP004', subject: 'VPN disconnects on shared drive',
      category: 'IT Support', description: 'GDrive sync drops over the office VPN intermittently.',
      priority: 'Medium', status: 'Resolved', createdDate: '2026-06-20',
      replies: { create: [{ senderId: 'EMP003', text: 'Reissued VPN profile — please reconnect.', date: '2026-06-21' }] }
    }
  });

  // 11. Simulated Google Workspace data
  await prisma.simulatedGDrive.createMany({
    data: [
      { name: 'JJFO_HRMS_Vault', type: 'folder', parent: 'root', content: null },
      { name: 'EMP001_RajeshKumar_Vault', type: 'folder', parent: 'JJFO_HRMS_Vault', content: null },
      { name: 'EMP001_Profile.json', type: 'file', parent: 'EMP001_RajeshKumar_Vault', content: 'Metadata + salary config' },
      { name: 'EMP002_PriyaSharma_Vault', type: 'folder', parent: 'JJFO_HRMS_Vault', content: null },
      { name: 'EMP002_RelievingLetter.pdf', type: 'file', parent: 'EMP002_PriyaSharma_Vault', content: 'Relieving document (locked)' }
    ]
  });
  await prisma.simulatedGSheets.createMany({
    data: [
      { sheetName: 'Leaves_Log', data: JSON.stringify([{ id: 'LV002', name: 'Amit Patel', type: 'Sick Leave', days: 2, status: 'Approved' }]) },
      { sheetName: 'Payroll_Reconciliation', data: JSON.stringify([{ id: 'PR001', name: 'Priya Sharma', month: 'May 2026', net: 106100, status: 'Paid' }]) }
    ]
  });
  await prisma.simulatedGmail.createMany({
    data: [
      { sender: 'hr@jjfo.com', recipient: 'priya@jjfo.com', subject: 'Payslip Dispatched - May 2026', body: 'Dear Priya, your May 2026 payslip has been generated.', timestamp: '2026-05-31 05:00 PM' },
      { sender: 'hr@jjfo.com', recipient: 'rajesh@jjfo.com', subject: 'ACTION: Onboarding verification - Vikram Singh', body: 'New hire Vikram Singh has a draft profile pending review.', timestamp: '2026-06-30 09:15 AM' }
    ]
  });

  // A few starter notifications so the bell isn't empty on first login.
  await prisma.notification.createMany({
    data: [
      { userId: 'EMP001', title: 'Onboarding pending', body: 'Vikram Singh has an onboarding draft awaiting completion.', kind: 'onboarding' },
      { userId: 'EMP002', title: 'Leave awaiting your approval', body: 'Sneha Desai requested 9 days of Annual Leave (2-level approval).', kind: 'leave' }
    ]
  });

  console.log('Database seeding complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
