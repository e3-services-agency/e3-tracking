export function downloadHandoffFile(htmlContent: string, projectName: string = 'Tracking_Plan') {
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `${projectName.replace(/\s+/g, '_')}_Handoff_${dateStr}.html`;
  
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}