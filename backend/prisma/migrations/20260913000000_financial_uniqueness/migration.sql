-- Prevent duplicate financial records during concurrent processing.
CREATE UNIQUE INDEX "Payroll_employeeId_month_key"
ON "Payroll"("employeeId", "month");

CREATE UNIQUE INDEX "TaxDeclaration_employeeId_key"
ON "TaxDeclaration"("employeeId");
