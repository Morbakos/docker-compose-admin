import { Component, EventEmitter, Input, Output } from "@angular/core";

@Component({
  selector: "app-service-selection",
  standalone: true,
  template: `
    <section class="services-card">
      <div class="card-heading">
        <div><span class="eyebrow">CONFIGURATION</span><h2>Services à lancer</h2><p>Choisissez les services nécessaires à votre session.</p></div>
        <span class="selection-count">{{ selected.length }} / {{ services.length }} sélectionnés</span>
      </div>
      @if (services.length === 0) {
        <p class="empty-copy">Aucun service détecté dans les fichiers Compose.</p>
      } @else {
        <div class="selection-toolbar">
          <button type="button" (click)="selectAll.emit()">Tout sélectionner</button>
          <button type="button" (click)="clear.emit()">Tout désélectionner</button>
        </div>
        <div class="service-grid">
          @for (service of services; track service) {
            <label class="service-choice" [class.checked]="selected.includes(service)">
              <input type="checkbox" [checked]="selected.includes(service)" (change)="toggle.emit(service)" />
              <span class="checkmark" aria-hidden="true"></span>
              <span class="service-name">{{ service }}</span>
            </label>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    :host{display:block}.services-card{padding:24px;border:1px solid #dfe7f2;border-radius:16px;background:#fff;box-shadow:0 5px 18px #233c5b08}
    .card-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.eyebrow{color:#6685bd;font-size:11px;font-weight:750;letter-spacing:1px}
    h2{margin:5px 0;color:#1d2b42;font-size:21px}.card-heading p,.empty-copy{margin:0;color:#7e8ba0;font-size:14px}
    .selection-count{padding:7px 11px;border-radius:20px;color:#285bb4;background:#edf4ff;font-size:13px;font-weight:700;white-space:nowrap}
    .selection-toolbar{display:flex;gap:16px;margin:22px 0 12px}.selection-toolbar button{padding:0;border:0;color:#3568bb;background:none;font:inherit;font-size:13px;font-weight:650;cursor:pointer}
    .service-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
    .service-choice{display:flex;min-width:0;align-items:center;gap:11px;padding:15px;border:1px solid #e2e8f1;border-radius:10px;background:#fbfcfe;cursor:pointer;transition:.15s}
    .service-choice:hover{border-color:#a9c1e8;background:#f7faff}.service-choice.checked{border-color:#8eafe4;background:#f1f6ff}
    .service-choice input{position:absolute;opacity:0;width:1px;height:1px}.checkmark{display:grid;width:19px;height:19px;flex:0 0 auto;place-items:center;border:1.5px solid #b7c2d2;border-radius:5px;background:#fff}
    .checked .checkmark{border-color:#2862cd;background:#2862cd}.checked .checkmark:after{content:"";width:8px;height:4px;border:2px solid white;border-top:0;border-right:0;transform:rotate(-45deg) translateY(-1px)}
    .service-name{overflow-wrap:anywhere;color:#2f4059;font-size:14px;font-weight:650}
    @media(max-width:600px){.card-heading{flex-direction:column}.services-card{padding:18px}}
  `],
})
export class ServiceSelectionComponent {
  @Input() services: string[] = [];
  @Input() selected: string[] = [];
  @Output() toggle = new EventEmitter<string>();
  @Output() selectAll = new EventEmitter<void>();
  @Output() clear = new EventEmitter<void>();
}