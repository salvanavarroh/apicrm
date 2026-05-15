"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { approveSale, rejectSale } from "@/app/(app)/admin/sales/actions";

export function ValidationForm({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scoring, setScoring] = useState(false);
  const [scoringComment, setScoringComment] = useState("");
  const [docs, setDocs] = useState(false);
  const [docsComment, setDocsComment] = useState("");
  const [payment, setPayment] = useState(false);
  const [paymentComment, setPaymentComment] = useState("");
  const [generalComment, setGeneralComment] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const canApprove = scoring && docs && payment;

  function approve() {
    startTransition(async () => {
      const result = await approveSale(saleId, {
        scoring_check: true,
        scoring_comment: scoringComment,
        documentation_check: true,
        documentation_comment: docsComment,
        payment_check: true,
        payment_comment: paymentComment,
        general_comment: generalComment,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Venta aprobada");
      router.refresh();
    });
  }

  function reject() {
    startTransition(async () => {
      const result = await rejectSale(saleId, {
        rejection_reason: rejectionReason,
        scoring_check: scoring,
        scoring_comment: scoringComment,
        documentation_check: docs,
        documentation_comment: docsComment,
        payment_check: payment,
        payment_comment: paymentComment,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Venta rechazada");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Triple check</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CheckBlock
          label="Scoring"
          description="Verificar capacidad de pago del cliente."
          checked={scoring}
          onChange={setScoring}
          comment={scoringComment}
          onCommentChange={setScoringComment}
        />
        <CheckBlock
          label="Documentación"
          description="DNI, comprobantes, contratos firmados."
          checked={docs}
          onChange={setDocs}
          comment={docsComment}
          onCommentChange={setDocsComment}
        />
        <CheckBlock
          label="Pago"
          description="Adelanto / anticipo recibido."
          checked={payment}
          onChange={setPayment}
          comment={paymentComment}
          onCommentChange={setPaymentComment}
        />

        <div>
          <Label className="text-xs">Observación general (opcional)</Label>
          <Textarea
            rows={2}
            value={generalComment}
            onChange={(e) => setGeneralComment(e.target.value)}
          />
        </div>

        {showReject && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <Label className="text-xs text-destructive">
              Motivo del rechazo (mín. 10 caracteres)
            </Label>
            <Textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Ej: el cliente no completó la documentación requerida luego del seguimiento."
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          {!showReject ? (
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => setShowReject(true)}
              disabled={pending}
            >
              Rechazar
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => setShowReject(false)}
              disabled={pending}
            >
              Cancelar rechazo
            </Button>
          )}
          {showReject ? (
            <Button
              variant="destructive"
              onClick={reject}
              disabled={pending || rejectionReason.trim().length < 10}
            >
              {pending ? "Rechazando…" : "Confirmar rechazo"}
            </Button>
          ) : (
            <Button onClick={approve} disabled={pending || !canApprove}>
              {pending ? "Aprobando…" : "Aprobar venta"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CheckBlock({
  label,
  description,
  checked,
  onChange,
  comment,
  onCommentChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  comment: string;
  onCommentChange: (v: string) => void;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <label className="flex cursor-pointer items-start gap-2">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onChange(Boolean(v))}
        />
        <div className="flex-1">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </label>
      <Textarea
        rows={2}
        placeholder="Observación (opcional)"
        value={comment}
        onChange={(e) => onCommentChange(e.target.value)}
        className="mt-2"
      />
    </div>
  );
}
