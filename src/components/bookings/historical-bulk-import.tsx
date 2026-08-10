"use client";

import { useState, type ChangeEvent } from "react";
import Papa from "papaparse";
import { Download, Upload, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { trpc } from "@/lib/trpc";
import { useTranslations } from "@/hooks/use-translations";
import { historicalBookingInputSchema, type HistoricalBookingInput, type HistoricalPassengerInput } from "@/lib/validations";

const CSV_COLUMNS = [
  "fecha",
  "hora_inicio",
  "hora_fin",
  "matricula",
  "proposito",
  "notas",
  "telefono",
  "pasajero_nombre",
  "pasajero_tipo_id",
  "pasajero_numero_id",
  "pasajeros_adicionales",
] as const;

interface ParsedRow {
  rowNumber: number; // matches the row number in the spreadsheet (header = 1)
  raw: Record<string, string>;
  data: HistoricalBookingInput | null;
  error: string | null;
}

interface ImportSummary {
  succeeded: number;
  failed: number;
  results: { index: number; bookingId?: string; error?: string }[];
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function normalizeIdType(raw: string): "cedula" | "passport" | "other" | undefined {
  const value = raw.trim().toLowerCase();
  if (["cedula", "cédula", "ci", "v", "e"].includes(value)) return "cedula";
  if (["passport", "pasaporte", "p"].includes(value)) return "passport";
  if (["other", "otro", "o"].includes(value)) return "other";
  return undefined;
}

function buildPassenger(name: string, typeRaw: string, number: string): HistoricalPassengerInput | null {
  const identificationType = normalizeIdType(typeRaw);
  if (!name.trim() || !identificationType || !number.trim()) return null;
  return { name: name.trim(), identificationType, identificationNumber: number.trim() };
}

function parseAdditionalPassengers(raw: string): HistoricalPassengerInput[] {
  if (!raw.trim()) return [];
  return raw
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [name = "", typeRaw = "", number = ""] = chunk.split(":").map((part) => part.trim());
      return { name, identificationType: normalizeIdType(typeRaw) ?? "other", identificationNumber: number };
    })
    .filter((passenger) => passenger.name && passenger.identificationNumber);
}

function parseCsvRow(raw: Record<string, string>, rowNumber: number): ParsedRow {
  try {
    const fecha = (raw.fecha ?? "").trim();
    const horaInicio = (raw.hora_inicio ?? "").trim();
    const horaFin = (raw.hora_fin ?? "").trim();

    if (!fecha || !horaInicio || !horaFin) {
      return { rowNumber, raw, data: null, error: "fecha, hora_inicio y hora_fin son requeridos" };
    }

    const [year, month, day] = fecha.split("-").map(Number);
    const [startHour, startMinute] = horaInicio.split(":").map(Number);
    const [endHour, endMinute] = horaFin.split(":").map(Number);
    const startDate = new Date(year, (month || 1) - 1, day, startHour, startMinute);
    const endDate = new Date(year, (month || 1) - 1, day, endHour, endMinute);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return { rowNumber, raw, data: null, error: "Formato de fecha/hora inválido (usa YYYY-MM-DD y HH:mm)" };
    }

    const primaryPassenger = buildPassenger(
      raw.pasajero_nombre ?? "",
      raw.pasajero_tipo_id ?? "",
      raw.pasajero_numero_id ?? ""
    );

    if (!primaryPassenger) {
      return {
        rowNumber,
        raw,
        data: null,
        error: "pasajero_nombre, pasajero_tipo_id y pasajero_numero_id son requeridos (tipo: cedula, pasaporte u otro)",
      };
    }

    const passengers = [primaryPassenger, ...parseAdditionalPassengers(raw.pasajeros_adicionales ?? "")];

    const candidate = {
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      purpose: (raw.proposito ?? "").trim(),
      notes: raw.notas?.trim() || undefined,
      contactPhone: raw.telefono?.trim() || undefined,
      helicopterRegistration: (raw.matricula ?? "").trim(),
      passengers,
    };

    const parsed = historicalBookingInputSchema.safeParse(candidate);
    if (!parsed.success) {
      return { rowNumber, raw, data: null, error: parsed.error.issues[0]?.message ?? "Fila inválida" };
    }

    return { rowNumber, raw, data: parsed.data, error: null };
  } catch {
    return { rowNumber, raw, data: null, error: "No se pudo procesar la fila" };
  }
}

export function HistoricalBulkImport() {
  const { t } = useTranslations();
  const utils = trpc.useUtils();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const bulkImport = trpc.bookings.bulkCreateHistorical.useMutation({
    onSuccess: (result) => {
      setSummary(result);
      utils.bookings.listAll.invalidate();
      toast({
        type: result.failed > 0 ? "info" : "success",
        title: t("historicalBookings.importSummary"),
        description: t("historicalBookings.importResultDescription", {
          succeeded: result.succeeded,
          failed: result.failed,
        }),
      });
    },
    onError: () => {
      toast({ type: "error", title: t("common.error"), description: t("errors.generic") });
    },
  });

  const validRows = rows.filter((row) => row.data);
  const invalidRows = rows.filter((row) => !row.data);

  const handleDownloadTemplate = () => {
    const example = [
      "2026-08-01",
      "14:30",
      "14:40",
      "YV1234",
      "Transporte ejecutivo",
      "",
      "+58 412 1234567",
      "Juan Perez",
      "cedula",
      "V-12345678",
      "",
    ];
    const csv = [CSV_COLUMNS.join(","), example.map(csvEscape).join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-vuelos-historicos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setSummary(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setRows(results.data.map((raw, i) => parseCsvRow(raw, i + 2)));
      },
    });

    event.target.value = "";
  };

  const handleImport = () => {
    if (validRows.length === 0) return;
    bulkImport.mutate(validRows.map((row) => row.data!));
  };

  const handleDownloadFailedRows = () => {
    const failedRows: { raw: Record<string, string>; error: string }[] = [
      ...invalidRows.map((row) => ({ raw: row.raw, error: row.error ?? "" })),
      ...(summary?.results
        .filter((result) => result.error)
        .map((result) => ({ raw: validRows[result.index].raw, error: result.error ?? "" })) ?? []),
    ];

    if (failedRows.length === 0) return;

    const csv = [
      [...CSV_COLUMNS, "error"].join(","),
      ...failedRows.map(({ raw, error }) =>
        [...CSV_COLUMNS.map((column) => csvEscape(raw[column] ?? "")), csvEscape(error)].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vuelos-historicos-errores.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalFailed = invalidRows.length + (summary?.failed ?? 0);

  return (
    <div className="space-y-6 bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide border-b border-zinc-200 pb-2 mb-3">
          {t("historicalBookings.tabBulk")}
        </h3>
        <p className="text-sm text-zinc-500">{t("historicalBookings.csvHelp")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={handleDownloadTemplate}>
          <Download className="w-4 h-4" />
          {t("historicalBookings.downloadTemplate")}
        </Button>

        <label className="inline-flex">
          <span className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-zinc-200 bg-zinc-50 text-sm font-medium text-zinc-700 cursor-pointer hover:bg-zinc-100 transition-colors">
            <Upload className="w-4 h-4" />
            {t("historicalBookings.chooseFile")}
          </span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
        </label>

        {fileName && <span className="text-sm text-zinc-500">{fileName}</span>}
      </div>

      {rows.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="success">{t("historicalBookings.validRows", { count: validRows.length })}</Badge>
            {invalidRows.length > 0 && (
              <Badge variant="destructive">{t("historicalBookings.parsingErrors", { count: invalidRows.length })}</Badge>
            )}
          </div>

          <div className="border border-zinc-200 rounded-2xl overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-zinc-50/50">
                  <TableHead>{t("historicalBookings.tableHeaders.row")}</TableHead>
                  <TableHead>{t("historicalBookings.tableHeaders.date")}</TableHead>
                  <TableHead>{t("historicalBookings.tableHeaders.registration")}</TableHead>
                  <TableHead>{t("historicalBookings.tableHeaders.passenger")}</TableHead>
                  <TableHead>{t("historicalBookings.tableHeaders.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.rowNumber}>
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell>
                      {row.raw.fecha} {row.raw.hora_inicio}-{row.raw.hora_fin}
                    </TableCell>
                    <TableCell>{row.raw.matricula}</TableCell>
                    <TableCell>{row.raw.pasajero_nombre}</TableCell>
                    <TableCell>
                      {row.data ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="w-4 h-4" /> OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600" title={row.error ?? ""}>
                          <XCircle className="w-4 h-4" /> {row.error}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" onClick={handleImport} disabled={validRows.length === 0 || bulkImport.isPending}>
              {bulkImport.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("historicalBookings.importValid", { count: validRows.length })}
            </Button>
          </div>
        </>
      )}

      {summary && (
        <div className="space-y-3 border-t border-zinc-200 pt-4">
          <div className="flex items-center gap-2">
            <Badge variant="success">{t("historicalBookings.importSucceeded", { count: summary.succeeded })}</Badge>
            {summary.failed > 0 && (
              <Badge variant="destructive">{t("historicalBookings.importFailedCount", { count: summary.failed })}</Badge>
            )}
          </div>
          {totalFailed > 0 && (
            <Button type="button" variant="outline" onClick={handleDownloadFailedRows}>
              <Download className="w-4 h-4" />
              {t("historicalBookings.downloadFailedRows")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
