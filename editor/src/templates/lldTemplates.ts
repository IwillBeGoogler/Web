import type { Template } from './monitoringStack';
import { build, cls, rel, type Pattern } from './umlTemplates';

const LLD: Pattern[] = [
  {
    id: 'lld-parking-lot', name: 'LLD — Parking lot', title: 'Parking lot design', anchor: 'ParkingLot',
    note: 'A lot owns floors of spots; entering issues a ticket, leaving prices it with a pluggable fee strategy.',
    model: {
      classes: [
        cls('ParkingLot', 'class', ['- floors: ParkingFloor[]', '- feeStrategy: FeeStrategy'], ['+ park(v: Vehicle): Ticket', '+ unpark(t: Ticket): Payment']),
        cls('ParkingFloor', 'class', ['- level: int', '- spots: ParkingSpot[]'], ['+ findFreeSpot(type: SpotType): ParkingSpot']),
        cls('ParkingSpot', 'class', ['- id: string', '- type: SpotType', '- free: boolean'], ['+ assign(v: Vehicle): void', '+ release(): void']),
        cls('Vehicle', 'abstract', ['# plate: string'], ['+ getSpotType(): SpotType']),
        cls('Car', 'class', [], ['+ getSpotType(): SpotType']),
        cls('Motorcycle', 'class', [], ['+ getSpotType(): SpotType']),
        cls('Ticket', 'class', ['- id: string', '- entryTime: DateTime', '- spot: ParkingSpot', '- vehicle: Vehicle'], ['+ duration(): Duration']),
        cls('FeeStrategy', 'interface', [], ['+ calculate(t: Ticket): Money']),
        cls('SpotType', 'enum', ['COMPACT', 'LARGE', 'MOTORCYCLE'], []),
      ],
      relations: [
        rel('ParkingLot', 'ParkingFloor', 'composition', { fromMult: '1', toMult: '1..*' }),
        rel('ParkingFloor', 'ParkingSpot', 'composition', { fromMult: '1', toMult: '1..*' }),
        rel('Car', 'Vehicle', 'inheritance'), rel('Motorcycle', 'Vehicle', 'inheritance'),
        rel('ParkingLot', 'FeeStrategy', 'association', { directed: true, toMult: '1', toRole: 'feeStrategy' }),
        rel('Ticket', 'ParkingSpot', 'association', { directed: true, toMult: '1', toRole: 'spot' }),
        rel('Ticket', 'Vehicle', 'association', { directed: true, toMult: '1', toRole: 'vehicle' }),
        rel('ParkingSpot', 'SpotType', 'dependency', { label: 'typed by' }),
        rel('ParkingLot', 'Ticket', 'dependency', { label: 'issues' }),
      ],
    },
  },
  {
    id: 'lld-library', name: 'LLD — Library', title: 'Library management design', anchor: 'Library',
    note: 'Members borrow physical copies of catalog books; a loan tracks due date and fine.',
    model: {
      classes: [
        cls('Library', 'class', ['- name: string'], ['+ search(q: string): Book[]', '+ checkout(m: Member, c: BookCopy): Loan', '+ giveBack(l: Loan): void']),
        cls('Book', 'class', ['- isbn: string', '- title: string', '- author: string'], ['+ availableCopies(): int']),
        cls('BookCopy', 'class', ['- barcode: string', '- status: CopyStatus'], ['+ markBorrowed(): void', '+ markAvailable(): void']),
        cls('Member', 'abstract', ['# id: string', '# name: string', '# maxLoans: int'], ['+ canBorrow(): boolean']),
        cls('Student', 'class', [], ['+ canBorrow(): boolean']),
        cls('Librarian', 'class', [], ['+ addBook(b: Book): void']),
        cls('Loan', 'class', ['- borrowedOn: Date', '- dueOn: Date', '- returnedOn: Date'], ['+ isOverdue(): boolean', '+ fine(): Money']),
        cls('CopyStatus', 'enum', ['AVAILABLE', 'BORROWED', 'LOST'], []),
      ],
      relations: [
        rel('Library', 'Book', 'aggregation', { fromMult: '1', toMult: '0..*' }),
        rel('Library', 'Member', 'aggregation', { fromMult: '1', toMult: '0..*' }),
        rel('Book', 'BookCopy', 'composition', { fromMult: '1', toMult: '1..*' }),
        rel('Student', 'Member', 'inheritance'), rel('Librarian', 'Member', 'inheritance'),
        rel('Loan', 'BookCopy', 'association', { directed: true, toMult: '1', toRole: 'copy' }),
        rel('Loan', 'Member', 'association', { directed: true, toMult: '1', toRole: 'member' }),
        rel('BookCopy', 'CopyStatus', 'dependency', { label: 'has' }),
      ],
    },
  },
  {
    id: 'lld-elevator', name: 'LLD — Elevator', title: 'Elevator system design', anchor: 'ElevatorController',
    note: 'A controller dispatches requests to cars; each car runs a state machine and serves stops in direction order.',
    model: {
      classes: [
        cls('ElevatorController', 'class', ['- cars: ElevatorCar[]', '- scheduler: Scheduler'], ['+ requestElevator(r: Request): void', '+ step(): void']),
        cls('ElevatorCar', 'class', ['- id: int', '- floor: int', '- direction: Direction', '- stops: Set<int>'], ['+ addStop(floor: int): void', '+ move(): void', '+ openDoor(): void']),
        cls('Scheduler', 'interface', [], ['+ pick(cars: ElevatorCar[], r: Request): ElevatorCar']),
        cls('NearestCarScheduler', 'class', [], ['+ pick(cars: ElevatorCar[], r: Request): ElevatorCar']),
        cls('Request', 'class', ['- floor: int', '- direction: Direction'], []),
        cls('Door', 'class', ['- open: boolean'], ['+ open(): void', '+ close(): void']),
        cls('Direction', 'enum', ['UP', 'DOWN', 'IDLE'], []),
      ],
      relations: [
        rel('ElevatorController', 'ElevatorCar', 'composition', { fromMult: '1', toMult: '1..*' }),
        rel('ElevatorController', 'Scheduler', 'association', { directed: true, toMult: '1', toRole: 'scheduler' }),
        rel('NearestCarScheduler', 'Scheduler', 'realization'),
        rel('ElevatorCar', 'Door', 'composition', { fromMult: '1', toMult: '1' }),
        rel('ElevatorCar', 'Direction', 'dependency', { label: 'moves' }),
        rel('ElevatorController', 'Request', 'dependency', { label: 'handles' }),
      ],
    },
  },
  {
    id: 'lld-atm', name: 'LLD — ATM', title: 'ATM design', anchor: 'ATM',
    note: 'The ATM authenticates a card against the bank, then runs transactions that update the account.',
    model: {
      classes: [
        cls('ATM', 'class', ['- cashBin: CashDispenser', '- bank: BankService'], ['+ insertCard(c: Card): void', '+ authenticate(pin: string): boolean', '+ perform(t: Transaction): Receipt']),
        cls('CashDispenser', 'class', ['- notes: int'], ['+ dispense(amount: Money): boolean']),
        cls('BankService', 'interface', [], ['+ verify(c: Card, pin: string): boolean', '+ getAccount(c: Card): Account']),
        cls('Card', 'class', ['- number: string', '- expires: Date'], []),
        cls('Account', 'class', ['- id: string', '- balance: Money'], ['+ debit(a: Money): void', '+ credit(a: Money): void']),
        cls('Transaction', 'abstract', ['# account: Account', '# amount: Money'], ['+ execute(): Receipt']),
        cls('Withdrawal', 'class', [], ['+ execute(): Receipt']),
        cls('Deposit', 'class', [], ['+ execute(): Receipt']),
        cls('BalanceInquiry', 'class', [], ['+ execute(): Receipt']),
      ],
      relations: [
        rel('ATM', 'CashDispenser', 'composition', { fromMult: '1', toMult: '1' }),
        rel('ATM', 'BankService', 'association', { directed: true, toMult: '1', toRole: 'bank' }),
        rel('ATM', 'Card', 'dependency', { label: 'reads' }),
        rel('Withdrawal', 'Transaction', 'inheritance'), rel('Deposit', 'Transaction', 'inheritance'), rel('BalanceInquiry', 'Transaction', 'inheritance'),
        rel('Transaction', 'Account', 'association', { directed: true, toMult: '1', toRole: 'account' }),
        rel('BankService', 'Account', 'dependency', { label: 'loads' }),
      ],
    },
  },
  {
    id: 'lld-hotel-booking', name: 'LLD — Hotel booking', title: 'Hotel booking design', anchor: 'Hotel',
    note: 'A reservation books a room for a date range; availability is checked before payment is taken.',
    model: {
      classes: [
        cls('Hotel', 'class', ['- name: string', '- rooms: Room[]'], ['+ findAvailable(r: DateRange, t: RoomType): Room[]']),
        cls('Room', 'class', ['- number: string', '- type: RoomType', '- pricePerNight: Money'], ['+ isAvailable(r: DateRange): boolean']),
        cls('Guest', 'class', ['- id: string', '- name: string', '- email: string'], ['+ book(room: Room, r: DateRange): Reservation']),
        cls('Reservation', 'class', ['- id: string', '- range: DateRange', '- status: ReservationStatus'], ['+ confirm(): void', '+ cancel(): void', '+ total(): Money']),
        cls('Payment', 'interface', [], ['+ charge(amount: Money): boolean']),
        cls('CardPayment', 'class', [], ['+ charge(amount: Money): boolean']),
        cls('ReservationStatus', 'enum', ['PENDING', 'CONFIRMED', 'CANCELLED'], []),
        cls('RoomType', 'enum', ['SINGLE', 'DOUBLE', 'SUITE'], []),
      ],
      relations: [
        rel('Hotel', 'Room', 'composition', { fromMult: '1', toMult: '1..*' }),
        rel('Guest', 'Reservation', 'association', { directed: true, fromMult: '1', toMult: '0..*', toRole: 'reservations' }),
        rel('Reservation', 'Room', 'association', { directed: true, toMult: '1', toRole: 'room' }),
        rel('Reservation', 'Payment', 'association', { directed: true, toMult: '0..1', toRole: 'payment' }),
        rel('CardPayment', 'Payment', 'realization'),
        rel('Room', 'RoomType', 'dependency', { label: 'typed by' }),
        rel('Reservation', 'ReservationStatus', 'dependency', { label: 'state' }),
      ],
    },
  },
];

export const TEMPLATES: Template[] = LLD.map((p) => ({ id: p.id, name: p.name, tags: ['uml', 'class', 'oop', 'ood', 'lld', p.id.slice(4)], build: () => build(p) }));
