import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export default function BracketExportButton({ bracketRef, tournamentName }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format) => {
    if (!bracketRef?.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(bracketRef.current, {
        backgroundColor: "#0b0f1a",
        scale: 2,
        useCORS: true,
      });

      if (format === "png") {
        const link = document.createElement("a");
        link.download = `${tournamentName || "bracket"}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } else {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? "landscape" : "portrait",
          unit: "px",
          format: [canvas.width / 2, canvas.height / 2],
        });
        pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
        pdf.save(`${tournamentName || "bracket"}.pdf`);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleExport("png")}
        disabled={exporting}
        className="gap-1.5 text-xs"
      >
        <Download className="w-3.5 h-3.5" />
        {exporting ? "Exporting…" : "PNG"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleExport("pdf")}
        disabled={exporting}
        className="gap-1.5 text-xs"
      >
        <Download className="w-3.5 h-3.5" />
        PDF
      </Button>
    </div>
  );
}