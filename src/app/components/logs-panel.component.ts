import { Component, EventEmitter, Input, Output } from "@angular/core";

@Component({
  selector: "app-logs-panel",
  standalone: true,
  template: `
    <section class="logs-panel"><div class="heading"><div><h2>Logs de l’environnement</h2><p>Actualisation automatique pendant la consultation.</p></div><button type="button" (click)="close.emit()" aria-label="Fermer les logs">×</button></div>
      @if (loading) { <p class="muted">Chargement des logs…</p> } @else { <pre>{{ logs || 'Aucun log disponible pour ce projet.' }}</pre> }
    </section>
  `,
  styles: [`
    :host{display:block}.logs-panel{padding:20px;border:1px solid #e5eaf1;border-radius:14px;background:#fff}.heading{display:flex;justify-content:space-between;align-items:center}.heading h2{margin:0 0 4px;color:#27364d;font-size:17px}.heading p,.muted{margin:0;color:#8995a7;font-size:12px}.heading button{border:0;color:#8290a3;background:none;font-size:24px;cursor:pointer}
    pre{max-height:360px;overflow:auto;margin:14px 0 0;padding:16px;border-radius:9px;color:#d3dbea;background:#172235;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
  `],
})
export class LogsPanelComponent {
  @Input() logs: string | null = null;
  @Input() loading = false;
  @Output() close = new EventEmitter<void>();
}