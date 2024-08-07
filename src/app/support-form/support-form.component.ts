import {ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit} from '@angular/core';
import {MatCardModule} from "@angular/material/card";
import {MatButtonModule} from "@angular/material/button";
import {MatDivider} from "@angular/material/divider";
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup, FormGroupDirective,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors, ValidatorFn,
  Validators
} from '@angular/forms';
import {MatInputModule} from '@angular/material/input';
import {MatFormFieldModule} from '@angular/material/form-field';
import {
  AirtableCreateEntityRequest,
  AirtableEntity,
  AirtableRequestEntity,
  Good,
  HotButton,
  HotButtonEntry, Minus,
  Refugee,
  Support
} from "../model";
import {MatAutocompleteModule} from "@angular/material/autocomplete";
import {MatDatepickerModule} from '@angular/material/datepicker';
import {provideMomentDateAdapter} from "@angular/material-moment-adapter";
import {_DATE_FORMAT} from "../app.config";
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  map,
  Observable,
  of,
  switchMap,
  tap
} from "rxjs";
import {AsyncPipe} from '@angular/common'
import {SupportGoodEntryComponent} from "../support-good-entry/support-good-entry.component";
import {MatToolbarModule} from "@angular/material/toolbar";
import {HotButtonPanelComponent} from "../hot-button-panel/hot-button-panel.component";
import {AirtableApiSettingsComponent} from "../airtable-api-settings/airtable-api-settings.component";
import {AirtableClientService} from "../airtable-api/airtable-client.service";
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatSnackBar} from "@angular/material/snack-bar";

@Component({
  selector: 'app-support-form',
  standalone: true,
  providers: [provideMomentDateAdapter(_DATE_FORMAT, {useUtc: true})],
  imports: [
    MatCardModule,
    MatButtonModule,
    MatDivider,
    MatInputModule,
    FormsModule,
    MatFormFieldModule,
    MatAutocompleteModule,
    MatDatepickerModule,
    AsyncPipe,
    ReactiveFormsModule,
    SupportGoodEntryComponent,
    MatToolbarModule,
    HotButtonPanelComponent,
    AirtableApiSettingsComponent,
    MatProgressSpinnerModule,
    MatProgressBarModule
  ],
  templateUrl: './support-form.component.html',
  styleUrl: './support-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SupportFormComponent implements OnInit {

  refugeeFC: FormControl<AirtableEntity<Refugee> | string | null> = new FormControl<AirtableEntity<Refugee> | string | null>(null,
    [Validators.required, this.refugeeValidator()]);
  refugeeOptions: Observable<AirtableEntity<Refugee>[]> = of([]);
  refugeeFCSpinner: boolean = false

  supportDateFC: FormControl<Date | null>  = new FormControl<Date | null>(null, [Validators.required]);
  goodEntriesFA: FormArray<FormGroup> = new FormArray<FormGroup>([], [this.goodArrayValidator()]);

  supportForm: FormGroup;
  supportFormSendingProgressBar: boolean = false;

  searchGoodEntryIndexById: (id: string) => number;

  hotButtonMacro?: HotButton;

  constructor(
    private formBuilder: FormBuilder,
    private apiClient: AirtableClientService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {
    this.supportForm = this.formBuilder.group({
      "refugee": this.refugeeFC,
      "supportDate": this.supportDateFC,
      "goodEntries": this.goodEntriesFA
    });

    const createSearchGoodEntryByIdFunction: ((goodEntriesFormArray: FormArray<FormGroup>) => (id: string) => number) =
      (goodEntriesFormArray) => {
        return (id: string) => {
          return goodEntriesFormArray.controls.findIndex(it => (<AirtableEntity<Good>>(it.get('good')?.value))?.id === id)
        }
      }

    this.searchGoodEntryIndexById = createSearchGoodEntryByIdFunction(this.goodEntriesFA);
  }

  ngOnInit(): void {
    this.addGoodEntrySlot();

    this.refugeeOptions = this.refugeeFC.valueChanges.pipe(
      distinctUntilChanged(),
      debounceTime(500),
      filter(it => !!it && typeof it == "string" && it.length > 2),
      tap(() => {
        this.refugeeFCSpinner = true;
        this.cdr.detectChanges()
      }),
      switchMap(it => this.apiClient.searchRefugee(<string>it)
        .pipe(tap(() => {
          this.refugeeFCSpinner = false;
          this.cdr.detectChanges()
        })))
    );
  }

  addGoodEntrySlot(good?: AirtableEntity<Good>, quantity?: number): void {
    let goodEntryFormGroup = new FormGroup<any>([]);
    goodEntryFormGroup.addControl("good", new FormControl(good))
    goodEntryFormGroup.addControl("quantity", new FormControl<number>(quantity ? quantity : 1, {nonNullable: true}))
    this.goodEntriesFA.push(goodEntryFormGroup);
  }

  submitGoodEntry(formGroup: FormGroup): void {
    if (formGroup.valid && this.lastSlotGood()) {
      this.addGoodEntrySlot();
    }
  }

  removeGoodEntry(index: number) {
    this.goodEntriesFA.removeAt(index)
    if (this.goodEntriesFA.length === 0) {
      this.addGoodEntrySlot();
    }
  }

  hotButtonClick(hotButton: HotButton): void {
    hotButton.entries.forEach(it => this.processHotButtonEntry(it))
    if (this.lastSlotGood()) {
      this.addGoodEntrySlot()
    }
  }

  private lastSlotGood(): AirtableEntity<Good> | null | undefined {
    return this.goodEntriesFA.controls.at(-1)?.get("good")?.value;
  }

  private processHotButtonEntry(hotButtonEntry: HotButtonEntry) {
    const existingGoodIndex = this.searchGoodEntryIndexById(hotButtonEntry.good.id);
    if (existingGoodIndex >= 0) {
      let quantityFormCtrl = this.goodEntriesFA.controls.at(existingGoodIndex)!.get("quantity") as FormControl<number>;
      let newQuantityValue = quantityFormCtrl.value + hotButtonEntry.quantity;
      quantityFormCtrl.setValue(newQuantityValue);
      return;
    }

    const emptySlotIndex = this.goodEntriesFA.controls.findIndex(it => it.get("good") && !(it.get("good")?.value))
    if (emptySlotIndex >= 0) {
      this.goodEntriesFA.controls.at(emptySlotIndex)?.get("good")?.setValue(hotButtonEntry.good);
      this.goodEntriesFA.controls.at(emptySlotIndex)?.get("quantity")?.setValue(hotButtonEntry.quantity);
    } else {
      this.addGoodEntrySlot(hotButtonEntry.good, hotButtonEntry.quantity);
    }
  }

  displayRefugee(refugee?: AirtableEntity<Refugee>): string {
    const name = refugee?.fields?.Name ? refugee.fields.Name : '';
    const dob = refugee?.fields?.DOB ? ` (${new Date(refugee!.fields!.DOB!).toLocaleDateString()})` : ''
    return name + dob;
  }

  refugeeValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value || typeof control.value === "string") {
        return {refugee: "Search and choose an option"}
      }
      const refugee = control.value as AirtableEntity<Refugee>
      if (!refugee.id || !refugee.fields || !refugee.fields.Name) {
        return {refugee: "Search and choose an option"}
      }
      return null;
    };
  }

  goodArrayValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const filledGoodIndex: number = (control as FormArray<FormGroup>).controls.findIndex(it => it.get("good")?.value?.id && it.get("good")?.value?.id !== "")
      if (filledGoodIndex < 0) {
        return { goods: "Form is Empty" }
      }
      return null;
    };
  }

  async submitForm() {
    if (this.supportForm.pristine) {
      this.snackBar.open("Form is already sent. Change values to send another form.", "OK", {duration: 5000})
      return
    }

    this.supportFormSendingProgressBar = true;
    this.cdr.detectChanges()

    this.supportForm.markAllAsTouched()
    this.supportForm.updateValueAndValidity()
    this.goodEntriesFA.controls.forEach(it => it.markAllAsTouched())
    this.goodEntriesFA.controls.forEach(it => it.updateValueAndValidity())

    if (!this.supportForm.valid) {
      this.snackBar.open("Fill all required inputs", "OK", {duration: 5000})
      this.supportFormSendingProgressBar = false;
      this.cdr.detectChanges()
      return;
    }

    const support: AirtableRequestEntity<Support> = new AirtableRequestEntity<Support>(
      new Support([(<AirtableEntity<Refugee>>this.refugeeFC.value).id], this.supportDateFC.value!.toISOString().split("T", 1)[0])
    )

    let supportSaved: AirtableEntity<Support> | undefined =
      await firstValueFrom(
        this.apiClient.createSupport(new AirtableCreateEntityRequest<Support>([support]))
          .pipe(
            catchError(err => of([])),
            map(it => it[0] ? it[0] : undefined)
          ))

    if (!supportSaved) {
      this.supportFormSendingProgressBar = false
      this.cdr.detectChanges()
      return
    }

    const minuses: AirtableRequestEntity<Minus>[] = this.goodEntriesFA.controls
      .filter(it => it.get("good")?.value && it.get("good")?.value.id !== "")
      .map(it => new AirtableRequestEntity<Minus>(
        new Minus(
          [supportSaved.id],
          [(it.get("good")?.value as AirtableEntity<Good>).id],
          it.get("quantity")!.value as number
        )
      ))

    const minusesSaved: AirtableEntity<Minus>[] = await firstValueFrom(this.apiClient.createMinuses(minuses)
      .pipe(catchError(err => of([])))
    )

    if (minusesSaved.length > 0) {
      this.supportForm.markAsPristine()
      this.snackBar.open("Form Successfully Submitted!", "OK", {duration: 5000})
    }

    this.supportFormSendingProgressBar = false
    this.cdr.detectChanges()
  }

  resetForm(formDirective: FormGroupDirective) {
    formDirective.resetForm()
    this.goodEntriesFA.controls.splice(1)
  }

  createHotButtonMacro() {
    if (this.goodEntriesFA.controls.length === 0) return;

    const entries = this.goodEntriesFA.controls
      .filter(it => it.get("good")?.value && it.get("good")?.valid)
      .map(it => new HotButtonEntry(
          it.get("good")?.value,
          it.get("quantity")?.value as number
        )
      )
    if (entries.length > 0) this.hotButtonMacro = new HotButton("", entries)
  }

}
