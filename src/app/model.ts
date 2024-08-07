export class Bases {
  bases: Base[] = []
}

export class Base {
  id?: string
  name?: string
  permissionLevel?: string
}

export interface Fields {
}

export class AirtableRequestEntity<T extends Fields> {
  constructor(public readonly fields: T) {
  }
}

export class AirtableEntity<T extends Fields> extends AirtableRequestEntity<T>{
  createdTime?: string

  constructor(fields: T, public readonly id: string = "") {
    super(fields)
  }
}

export class AirtableCreateEntityRequest<T extends Fields> {
  constructor(public records: AirtableRequestEntity<T>[] = []) {
  }
}

export class AirtableEntityResponse<T extends Fields> {
  records: AirtableEntity<T>[] = []
}

export class Refugee implements Fields {
  Name?: string
  Phone?: string
  DOB?: string
  "ID Card"?: string
}

export class Good implements Fields {
  Type?: string
  "Weight 1 unit, kg"?: number
  Name?: string
  ID_name?: string
}

export class Support implements Fields {
  constructor(
    public readonly Who: string[], // array with ONE refugee Id inside
    public readonly Date: string
  ) {
  }
}

export class Minus implements Fields {
  constructor(
    public readonly Support: string[], // array with ONE support Id inside
    public readonly Goods: string[], // array with ONE good Id inside
    public readonly _minus: number // quantity
  ) {
  }
}

export class HotButton {
  readonly entries: HotButtonEntry[] = []
  type: HotButtonType = HotButtonType.Single

  constructor(public id: string, entries?: HotButtonEntry[]) {
    if (entries) this.entries = entries
    this.refreshType()
  }

  private refreshType() {
    switch (this.entries.length) {
      case 0 : this.type = HotButtonType.Dummy; break;
      case 1: {
        if (this.entries[0].quantity > 1) this.type = HotButtonType.Macro;
        else this.type = HotButtonType.Single;
        break;
      }
      default: this.type = HotButtonType.Macro;
    }
  }

  with(good?: AirtableEntity<Good>): HotButton {
    if (good) {
      this.entries.push(new HotButtonEntry(good))
      this.refreshType()
    }
    return this;
  }

  isDummy(): boolean {
    return this.entries.length === 0;
  }
}

export enum HotButtonType {
  Dummy, Single, Macro,
}

export class HotButtonEntry {
  constructor(public readonly good: AirtableEntity<Good>, public readonly quantity: number = 1) {
  }
}

export function displayGoodName(good?: AirtableEntity<Good>): string {
  return good?.fields?.ID_name ? good.fields.ID_name : "";
}
