export function downloadHandoffFile(
  htmlContent: string,
  projectName: string = 'Tracking_Plan'
) {
  const dateStr = new Date().toISOString().split('T')[0];

  const safeProjectName = projectName
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w.-]/g, '_')
    .replace(/_+/g, '_');

  const filename = `${safeProjectName || 'Tracking_Plan'}_Handoff_${dateStr}.html`;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}